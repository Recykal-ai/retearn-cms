import { Router } from "express";
import multer from "multer";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { storage } from "../lib/storage.js";
import { sanitizeFilename } from "../lib/filename.js";
import { logger } from "../lib/logger.js";
import { documentInclude, serializeDocument, loadPinnedIds } from "../lib/document-serializer.js";
import { loadAdminScope, canManageTeamOrProducts, getAdminsForTeamOrProducts } from "../lib/admin-scope.js";
import {
  notifyDocumentPending,
  notifyDocumentApproved,
  notifyDocumentRejected,
  notifyDeletionRequested,
  notifyDeletionApproved,
  notifyDeletionRejected,
} from "../lib/notification-emails.js";
import { getOrCreateOthersCategory } from "../lib/fallback-entities.js";
import { isOfficePreviewCandidate, convertOfficeToPdf } from "../lib/office-preview.js";
import {
  getDriveExportTarget,
  extractDriveFileId,
  exportDriveFile,
  signDriveExportUrl,
  verifyDriveExportRequest,
} from "../lib/google-drive.js";

export const documentsRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
});

function parseIdArray(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === "string");
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [raw];
    } catch {
      return [raw];
    }
  }
  return [];
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isAdminRole(role: string): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

// Converts and stores a docx/pptx upload's PDF stand-in alongside the raw
// file, returning the preview's storage key (or null if this isn't an
// Office file, or conversion failed — see office-preview.ts). Called right
// after the raw file itself is saved, at every site a FILE gets a fresh
// s3Key: initial upload, a new version, nowhere else (revert reuses an
// existing version's keys verbatim, no reconversion needed).
async function maybeSaveOfficePreview(s3Key: string, buffer: Buffer, filename: string): Promise<string | null> {
  if (!isOfficePreviewCandidate(filename)) return null;
  const pdf = await convertOfficeToPdf(buffer, filename);
  if (!pdf) return null;
  const previewS3Key = `${s3Key}.preview.pdf`;
  await storage.save(previewS3Key, pdf);
  return previewS3Key;
}

const SORTABLE_FIELDS: Record<string, string> = {
  modified: "updatedAt",
  name: "title",
};

// GET /api/documents?mode=team|product&entityId=&category=&q=&status=&modifiedSince=&sort=&dir=
documentsRouter.get("/", requireAuth, async (req, res) => {
  const { mode, entityId, category, q, status, modifiedSince, sort, dir } = req.query as Record<
    string,
    string | undefined
  >;

  const where: Record<string, unknown> = { deletedAt: null };

  if (mode === "team" && entityId) {
    where.ownerTeamId = entityId;
  } else if (mode === "product" && entityId) {
    where.products = { some: { productId: entityId } };
  }

  if (category) {
    const categoryIds = category.split(",").filter(Boolean);
    where.categories = { some: { categoryId: { in: categoryIds } } };
  }
  if (status) where.status = status;
  else where.status = "PUBLISHED";
  if (q) where.title = { contains: q, mode: "insensitive" };
  if (modifiedSince) where.updatedAt = { gte: new Date(modifiedSince) };

  // Pending/Rejected documents haven't been vetted for publication yet, so
  // they're not visible org-wide the way Published docs are — a plain User
  // only sees their own (their "My Uploads" view), and a scoped Admin only
  // sees the ones they can actually act on (otherwise Approve/Reject buttons
  // would just 403 on items outside their scope). Global Admins/Super Admins
  // are unrestricted, matching their org-wide approval authority.
  if (where.status !== "PUBLISHED") {
    if (isAdminRole(req.user!.role)) {
      const scope = await loadAdminScope(req.user!.userId, req.user!.role);
      if (scope !== null) {
        const teamIds = [...scope.teamIds];
        const productIds = [...scope.productIds];
        where.OR = [
          ...(teamIds.length ? [{ ownerTeamId: { in: teamIds } }] : []),
          ...(productIds.length ? [{ products: { some: { productId: { in: productIds } } } }] : []),
        ];
      }
    } else {
      where.uploadedById = req.user!.userId;
    }
  }

  const sortField = (sort && SORTABLE_FIELDS[sort]) || "updatedAt";
  const sortDir = dir === "asc" ? "asc" : "desc";

  const docs = await prisma.document.findMany({
    where,
    include: documentInclude,
    orderBy: { [sortField]: sortDir },
  });

  const pinnedIds = await loadPinnedIds(req.user!.userId, docs.map((d) => d.id));
  res.json(docs.map((d) => serializeDocument(d, pinnedIds)));
});

// GET /api/documents/recent?limit= — the current user's own most-recently
// touched documents (viewed or edited), most recent first, one entry per
// document. Must come before GET /:id or Express would match "recent" as an
// id. Reuses the audit log's "view" rows (recorded, but deliberately excluded
// from the admin-facing GET /api/audit-log — see audit-log.ts) purely to
// drive this personal list, not the org-wide audit trail.
const RECENT_ACTIONS = ["view", "upload", "upload_version", "revert_version", "update_tags", "approve", "reject"];

documentsRouter.get("/recent", requireAuth, async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 50);

  const recentActivity = await prisma.auditLog.findMany({
    where: { userId: req.user!.userId, action: { in: RECENT_ACTIONS } },
    orderBy: { createdAt: "desc" },
    distinct: ["targetId"],
    take: limit * 3, // buffer — some targets may since be soft-deleted
    select: { targetId: true },
  });

  const orderedIds = recentActivity.map((a) => a.targetId);
  if (orderedIds.length === 0) return res.json([]);

  // A doc rejected since it was last viewed is unopenable now (see
  // /:id/view-url), so it's excluded here too rather than left in as a dead
  // entry that 403s the moment it's clicked.
  const docs = await prisma.document.findMany({
    where: { id: { in: orderedIds }, deletedAt: null, status: { not: "REJECTED" } },
    include: documentInclude,
  });
  const docsById = new Map(docs.map((d) => [d.id, d]));

  const ordered = orderedIds
    .map((id) => docsById.get(id))
    .filter((d): d is NonNullable<typeof d> => Boolean(d))
    .slice(0, limit);

  const pinnedIds = await loadPinnedIds(req.user!.userId, ordered.map((d) => d.id));
  res.json(ordered.map((d) => serializeDocument(d, pinnedIds)));
});

// GET /api/documents/pinned — the current user's pinned documents, most
// recently pinned first. Must come before GET /:id, same reasoning as /recent.
documentsRouter.get("/pinned", requireAuth, async (req, res) => {
  const pins = await prisma.pinnedDocument.findMany({
    where: { userId: req.user!.userId },
    orderBy: { pinnedAt: "desc" },
  });
  const orderedIds = pins.map((p) => p.documentId);
  if (orderedIds.length === 0) return res.json([]);

  // Same reasoning as /recent — a pin on a document that's since been
  // rejected shouldn't linger as a dead, unopenable entry.
  const docs = await prisma.document.findMany({
    where: { id: { in: orderedIds }, deletedAt: null, status: { not: "REJECTED" } },
    include: documentInclude,
  });
  const docsById = new Map(docs.map((d) => [d.id, d]));
  const ordered = orderedIds.map((id) => docsById.get(id)).filter((d): d is NonNullable<typeof d> => Boolean(d));

  const pinnedIds = new Set(orderedIds);
  res.json(ordered.map((d) => serializeDocument(d, pinnedIds)));
});

// PUT /api/documents/:id/pin — idempotent, pins the doc for the current user.
// A personal bookmark, not a lifecycle action — no audit log entry, no
// permission check beyond being signed in and the doc existing.
documentsRouter.put<{ id: string }>("/:id/pin", requireAuth, async (req, res) => {
  const doc = await prisma.document.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!doc) return res.status(404).json({ error: "Document not found" });

  await prisma.pinnedDocument.upsert({
    where: { userId_documentId: { userId: req.user!.userId, documentId: doc.id } },
    update: {},
    create: { userId: req.user!.userId, documentId: doc.id },
  });
  res.json({ pinned: true });
});

// DELETE /api/documents/:id/pin — idempotent unpin.
documentsRouter.delete<{ id: string }>("/:id/pin", requireAuth, async (req, res) => {
  await prisma.pinnedDocument.deleteMany({ where: { userId: req.user!.userId, documentId: req.params.id } });
  res.json({ pinned: false });
});

// GET /api/documents/trash — Admin/Super Admin only. Recently soft-deleted
// documents with metadata about who deleted them and when, for the Recycle
// Bin. A scoped Admin only sees deletions within their own teams/products;
// same rule as approve/reject/delete elsewhere. Must come before GET /:id.
documentsRouter.get("/trash", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const scope = await loadAdminScope(req.user!.userId, req.user!.role);

  const where: Record<string, unknown> = { deletedAt: { not: null } };
  if (scope !== null) {
    const teamIds = [...scope.teamIds];
    const productIds = [...scope.productIds];
    const orConditions: Record<string, unknown>[] = [];
    if (teamIds.length) orConditions.push({ ownerTeamId: { in: teamIds } });
    if (productIds.length) orConditions.push({ products: { some: { productId: { in: productIds } } } });
    where.AND = orConditions.length > 0 ? [{ OR: orConditions }] : [{ id: "__none__" }];
  }

  const docs = await prisma.document.findMany({
    where,
    include: documentInclude,
    orderBy: { deletedAt: "desc" },
  });

  const docIds = docs.map((d) => d.id);
  const deleteEvents = docIds.length
    ? await prisma.auditLog.findMany({
        where: { targetId: { in: docIds }, action: "delete" },
        orderBy: { createdAt: "desc" },
        distinct: ["targetId"],
        include: { user: { select: { id: true, name: true, email: true } } },
      })
    : [];
  const deletedByMap = new Map(
    deleteEvents.map((e) => [e.targetId, { name: e.user.name, email: e.user.email, at: e.createdAt }]),
  );

  res.json(
    docs.map((d) => ({
      ...serializeDocument(d),
      deletedBy: deletedByMap.get(d.id) ?? null,
    })),
  );
});

function scopeWhereClause(scope: Awaited<ReturnType<typeof loadAdminScope>>): Record<string, unknown> {
  if (scope === null) return {};
  const teamIds = [...scope.teamIds];
  const productIds = [...scope.productIds];
  const orConditions: Record<string, unknown>[] = [];
  if (teamIds.length) orConditions.push({ ownerTeamId: { in: teamIds } });
  if (productIds.length) orConditions.push({ products: { some: { productId: { in: productIds } } } });
  return orConditions.length > 0 ? { OR: orConditions } : { id: "__none__" };
}

// GET /api/documents/deletion-requests — Admin/Super Admin only, scoped like
// /trash. Docs someone has asked to delete, awaiting an Admin's decision.
// Must come before GET /:id.
documentsRouter.get("/deletion-requests", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const scope = await loadAdminScope(req.user!.userId, req.user!.role);
  const docs = await prisma.document.findMany({
    where: { deletedAt: null, deletionRequestedAt: { not: null }, ...scopeWhereClause(scope) },
    include: documentInclude,
    orderBy: { deletionRequestedAt: "desc" },
  });

  // deletionRequestedById is a bare id (no Prisma relation, same convention as
  // DocumentVersion.uploadedBy) — batch-resolve names for display here rather
  // than adding a relation just for this one queue.
  const requesterIds = [...new Set(docs.map((d) => d.deletionRequestedById).filter((v): v is string => Boolean(v)))];
  const requesters = requesterIds.length
    ? await prisma.user.findMany({ where: { id: { in: requesterIds } }, select: { id: true, name: true, email: true } })
    : [];
  const requesterMap = new Map(requesters.map((u) => [u.id, { name: u.name, email: u.email }]));

  res.json(
    docs.map((d) => ({
      ...serializeDocument(d),
      deletionRequestedBy: d.deletionRequestedById ? (requesterMap.get(d.deletionRequestedById) ?? null) : null,
    })),
  );
});

// GET /api/documents/approvals-count — Admin/Super Admin only, scoped. Drives
// the red-dot notification badge on the Approvals nav item. Must come before GET /:id.
documentsRouter.get("/approvals-count", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const scope = await loadAdminScope(req.user!.userId, req.user!.role);
  const where = scopeWhereClause(scope);
  const [pendingUploads, deletionRequests] = await Promise.all([
    prisma.document.count({ where: { deletedAt: null, status: "PENDING", ...where } }),
    prisma.document.count({ where: { deletedAt: null, deletionRequestedAt: { not: null }, ...where } }),
  ]);
  res.json({ pendingUploads, deletionRequests });
});

// POST /api/documents/:id/recover — Admin/Super Admin only, same scope check
// as delete. Clears deletedAt; the document's prior status (Published/Pending/
// Rejected) was never touched by soft-delete, so it resumes exactly as it was.
documentsRouter.post<{ id: string }>("/:id/recover", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id, deletedAt: { not: null } },
    include: { products: true },
  });
  if (!doc) return res.status(404).json({ error: "Deleted document not found" });

  const scope = await loadAdminScope(req.user!.userId, req.user!.role);
  const productIds = doc.products.map((p) => p.productId);
  if (!canManageTeamOrProducts(scope, doc.ownerTeamId, productIds)) {
    return res.status(403).json({ error: "You don't have admin access to this document's team/product" });
  }

  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: { deletedAt: null },
    include: documentInclude,
  });

  await prisma.auditLog.create({
    data: { userId: req.user!.userId, action: "recover", targetId: doc.id },
  });

  res.json(serializeDocument(updated));
});

documentsRouter.get<{ id: string }>("/:id", requireAuth, async (req, res) => {
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { ...documentInclude, versions: { orderBy: { version: "desc" } } },
  });
  if (!doc) return res.status(404).json({ error: "Document not found" });

  // Same rule as the list endpoint — a Pending/Rejected doc isn't visible
  // org-wide by id any more than it is by listing.
  if (doc.status !== "PUBLISHED") {
    const isOwner = doc.uploadedById === req.user!.userId;
    const isAdmin = isAdminRole(req.user!.role);
    const scope = isAdmin ? await loadAdminScope(req.user!.userId, req.user!.role) : null;
    const allowed =
      isOwner || (isAdmin && canManageTeamOrProducts(scope, doc.ownerTeamId, doc.products.map((p) => p.productId)));
    if (!allowed) {
      return res.status(403).json({ error: "This document is not published yet" });
    }
  }

  const pinnedIds = await loadPinnedIds(req.user!.userId, [doc.id]);
  res.json(serializeDocument(doc, pinnedIds));
});

documentsRouter.post("/", requireAuth, upload.single("file"), async (req, res) => {
  const body = req.body as {
    title?: string;
    ownerTeamId?: string;
    sourceType?: string;
    externalUrl?: string;
  };
  const ownerTeamId = body.ownerTeamId?.trim() || null;
  const sourceType = body.sourceType === "LINK" ? "LINK" : "FILE";
  const productIds = parseIdArray((req.body as Record<string, unknown>).productIds);
  const categoryIds = parseIdArray((req.body as Record<string, unknown>).categoryIds);

  if (!ownerTeamId && productIds.length === 0) {
    return res.status(400).json({ error: "at least one tag (team or product) is required" });
  }
  // No category picked — often because none exist yet for this team/product
  // (e.g. a brand-new product with no tags set up). Rather than block the
  // upload, fall into that scope's "Others" category, auto-created on
  // demand — the same fallback already used when a delete would otherwise
  // strand a doc below the minimum tag requirement (see fallback-entities.ts).
  if (categoryIds.length === 0) {
    const scope = ownerTeamId ?? productIds[0];
    categoryIds.push(await getOrCreateOthersCategory(scope));
  }
  if (sourceType === "FILE" && !req.file) {
    return res.status(400).json({ error: "file is required when sourceType is FILE" });
  }
  if (sourceType === "LINK" && !body.title?.trim()) {
    return res.status(400).json({ error: "title is required when sourceType is LINK" });
  }
  if (sourceType === "LINK" && (!body.externalUrl?.trim() || !isValidHttpUrl(body.externalUrl.trim()))) {
    return res.status(400).json({ error: "externalUrl must be a valid http(s) URL" });
  }

  // FILE uploads are named after the file itself — no separate title to type or drift from it.
  const title = sourceType === "FILE" ? req.file!.originalname : body.title!.trim();

  const [team, categories] = await Promise.all([
    ownerTeamId ? prisma.team.findUnique({ where: { id: ownerTeamId } }) : null,
    prisma.category.findMany({ where: { id: { in: categoryIds } } }),
  ]);
  if (ownerTeamId && !team) return res.status(400).json({ error: "ownerTeamId must be an existing team" });
  if (categories.length !== categoryIds.length) {
    return res.status(400).json({ error: "one or more categoryIds do not exist" });
  }
  const validScopes = new Set([ownerTeamId, ...productIds].filter((v): v is string => Boolean(v)));
  if (categories.some((c) => !validScopes.has(c.scope))) {
    return res.status(400).json({ error: "every category must be scoped to this team or a tagged product" });
  }

  // Admins/Super Admins are the approvers — their own uploads don't need
  // review, but only within whatever they're actually scoped to manage. A
  // scoped Admin uploading outside their AdminScope gets treated like a
  // plain User for this one upload — still allowed, just lands in Pending.
  const scope = await loadAdminScope(req.user!.userId, req.user!.role);
  const autoPublish = isAdminRole(req.user!.role) && canManageTeamOrProducts(scope, ownerTeamId, productIds);

  const document = await prisma.document.create({
    data: {
      title,
      status: autoPublish ? "PUBLISHED" : "PENDING",
      publishedAt: autoPublish ? new Date() : null,
      ownerTeamId,
      uploadedById: req.user!.userId,
      sourceType,
      externalUrl: sourceType === "LINK" ? body.externalUrl!.trim() : null,
      products: { create: productIds.map((productId) => ({ productId })) },
      categories: { create: categoryIds.map((categoryId) => ({ categoryId })) },
    },
  });

  let s3Key: string | null = null;
  let previewS3Key: string | null = null;
  if (sourceType === "FILE" && req.file) {
    s3Key = `${document.id}/1/${sanitizeFilename(req.file.originalname)}`;
    await storage.save(s3Key, req.file.buffer);
    previewS3Key = await maybeSaveOfficePreview(s3Key, req.file.buffer, req.file.originalname);
    await prisma.document.update({ where: { id: document.id }, data: { s3Key, previewS3Key } });
  }

  await prisma.documentVersion.create({
    data: {
      documentId: document.id,
      version: 1,
      sourceType,
      s3Key,
      previewS3Key,
      externalUrl: sourceType === "LINK" ? body.externalUrl!.trim() : null,
      uploadedBy: req.user!.userId,
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: "upload",
      targetId: document.id,
      metadata: { sourceType, autoPublished: autoPublish },
    },
  });

  const full = await prisma.document.findUniqueOrThrow({
    where: { id: document.id },
    include: documentInclude,
  });

  if (!autoPublish) {
    const admins = await getAdminsForTeamOrProducts(ownerTeamId, productIds);
    await notifyDocumentPending(admins, { id: full.id, title: full.title }, { name: full.uploadedBy.name }, "upload");
  }

  res.status(201).json(serializeDocument(full));
});

documentsRouter.post<{ id: string }>("/:id/versions", requireAuth, upload.single("file"), async (req, res) => {
  const existing = await prisma.document.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { products: true },
  });
  if (!existing) return res.status(404).json({ error: "Document not found" });

  const isOwner = existing.uploadedById === req.user!.userId;
  const isAdmin = isAdminRole(req.user!.role);
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: "Only the uploader or an admin can push a new version" });
  }
  if (existing.status === "PENDING") {
    return res.status(409).json({ error: "Document is already pending review — resolve it before pushing a new version" });
  }

  const body = req.body as { sourceType?: string; externalUrl?: string; note?: string };
  const sourceType = body.sourceType === "LINK" ? "LINK" : "FILE";

  if (sourceType === "FILE" && !req.file) {
    return res.status(400).json({ error: "file is required when sourceType is FILE" });
  }
  if (sourceType === "LINK" && (!body.externalUrl?.trim() || !isValidHttpUrl(body.externalUrl.trim()))) {
    return res.status(400).json({ error: "externalUrl must be a valid http(s) URL" });
  }

  const nextVersion = existing.currentVersion + 1;
  let s3Key: string | null = null;
  let previewS3Key: string | null = null;
  if (sourceType === "FILE" && req.file) {
    s3Key = `${existing.id}/${nextVersion}/${sanitizeFilename(req.file.originalname)}`;
    await storage.save(s3Key, req.file.buffer);
    previewS3Key = await maybeSaveOfficePreview(s3Key, req.file.buffer, req.file.originalname);
  }
  const externalUrl = sourceType === "LINK" ? body.externalUrl!.trim() : null;
  // Same scope-aware auto-publish rule as the initial upload — a scoped
  // Admin pushing a version to a document outside their AdminScope lands
  // in Pending instead, same as a plain User would.
  const scope = await loadAdminScope(req.user!.userId, req.user!.role);
  const autoPublish =
    isAdmin && canManageTeamOrProducts(scope, existing.ownerTeamId, existing.products.map((p) => p.productId));

  await prisma.documentVersion.create({
    data: {
      documentId: existing.id,
      version: nextVersion,
      sourceType,
      s3Key,
      previewS3Key,
      externalUrl,
      note: body.note?.trim() || null,
      uploadedBy: req.user!.userId,
    },
  });

  const updated = await prisma.document.update({
    where: { id: existing.id },
    data: {
      currentVersion: nextVersion,
      sourceType,
      s3Key,
      previewS3Key,
      externalUrl,
      title: sourceType === "FILE" ? req.file!.originalname : existing.title,
      status: autoPublish ? "PUBLISHED" : "PENDING",
      publishedAt: autoPublish ? new Date() : null,
      rejectionNote: null,
    },
    include: documentInclude,
  });

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: "upload_version",
      targetId: existing.id,
      metadata: { version: nextVersion, autoPublished: autoPublish },
    },
  });

  if (!autoPublish) {
    const admins = await getAdminsForTeamOrProducts(
      updated.ownerTeamId,
      updated.products.map((p) => p.product.id),
    );
    await notifyDocumentPending(admins, { id: updated.id, title: updated.title }, { name: updated.uploadedBy.name }, "new_version");
  }

  res.status(201).json(serializeDocument(updated));
});

// POST /api/documents/:id/versions/:version/revert — makes an older (or, after
// reverting once, a newer) version current again. Never rewrites history: this
// creates a brand-new version row that copies the target version's content,
// exactly like pushing a new version does, so the full chain stays intact and
// "revert the revert" is just picking the old current version from the list
// again. Same permission gate, soft-lock, and auto-publish-if-admin rule as
// pushing a version — reverting is just a version push whose content comes
// from history instead of a fresh file/link.
documentsRouter.post<{ id: string; version: string }>(
  "/:id/versions/:version/revert",
  requireAuth,
  async (req, res) => {
    const existing = await prisma.document.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { products: true },
    });
    if (!existing) return res.status(404).json({ error: "Document not found" });

    const isOwner = existing.uploadedById === req.user!.userId;
    const isAdmin = isAdminRole(req.user!.role);
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: "Only the uploader or an admin can revert to another version" });
    }
    if (existing.status === "PENDING") {
      return res.status(409).json({ error: "Document is already pending review — resolve it before reverting" });
    }

    const targetVersionNumber = Number(req.params.version);
    const target = await prisma.documentVersion.findFirst({
      where: { documentId: existing.id, version: targetVersionNumber },
    });
    if (!target) return res.status(404).json({ error: "Version not found" });
    if (targetVersionNumber === existing.currentVersion) {
      return res.status(409).json({ error: "That version is already current" });
    }

    const nextVersion = existing.currentVersion + 1;
    // Same scope-aware auto-publish rule as pushing a version.
    const scope = await loadAdminScope(req.user!.userId, req.user!.role);
    const autoPublish =
      isAdmin && canManageTeamOrProducts(scope, existing.ownerTeamId, existing.products.map((p) => p.productId));

    // Reuses the target's existing s3Key/previewS3Key/externalUrl rather than
    // duplicating the file (or reconverting it) — nothing in this app ever
    // deletes an individual version's file, so pointing a new version row at
    // the same keys is safe.
    await prisma.documentVersion.create({
      data: {
        documentId: existing.id,
        version: nextVersion,
        sourceType: target.sourceType,
        s3Key: target.s3Key,
        previewS3Key: target.previewS3Key,
        externalUrl: target.externalUrl,
        note: `Reverted to version ${targetVersionNumber}`,
        uploadedBy: req.user!.userId,
      },
    });

    const updated = await prisma.document.update({
      where: { id: existing.id },
      data: {
        currentVersion: nextVersion,
        sourceType: target.sourceType,
        s3Key: target.s3Key,
        previewS3Key: target.previewS3Key,
        externalUrl: target.externalUrl,
        // FILE titles always mirror the current version's filename; a LINK
        // doc's title is independent of which version is current.
        title: target.sourceType === "FILE" && target.s3Key ? target.s3Key.split("/").pop()! : existing.title,
        status: autoPublish ? "PUBLISHED" : "PENDING",
        publishedAt: autoPublish ? new Date() : null,
        rejectionNote: null,
      },
      include: documentInclude,
    });

    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: "revert_version",
        targetId: existing.id,
        metadata: { toVersion: targetVersionNumber, newVersion: nextVersion, autoPublished: autoPublish },
      },
    });

    if (!autoPublish) {
      const admins = await getAdminsForTeamOrProducts(
        updated.ownerTeamId,
        updated.products.map((p) => p.product.id),
      );
      await notifyDocumentPending(admins, { id: updated.id, title: updated.title }, { name: updated.uploadedBy.name }, "revert");
    }

    res.status(201).json(serializeDocument(updated));
  },
);

// PATCH /api/documents/:id/tags — retags an existing document (owning team,
// product tags, category tags) without touching its file/version, so a doc
// can be moved from one team/product to another. Same permission gate and
// soft-lock as pushing a version; a scoped Admin also needs access to both
// the document's current tags and the new ones being assigned.
documentsRouter.patch<{ id: string }>("/:id/tags", requireAuth, async (req, res) => {
  const existing = await prisma.document.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { products: true },
  });
  if (!existing) return res.status(404).json({ error: "Document not found" });

  const isOwner = existing.uploadedById === req.user!.userId;
  const isAdmin = isAdminRole(req.user!.role);
  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: "Only the uploader or an admin can edit this document's tags" });
  }
  if (existing.status === "PENDING") {
    return res.status(409).json({ error: "Document is pending review — resolve it before editing tags" });
  }

  if (req.user!.role === "ADMIN") {
    const scope = await loadAdminScope(req.user!.userId, req.user!.role);
    const currentProductIds = existing.products.map((p) => p.productId);
    if (!canManageTeamOrProducts(scope, existing.ownerTeamId, currentProductIds)) {
      return res.status(403).json({ error: "You don't have admin access to this document's current team/product" });
    }
  }

  const body = req.body as { ownerTeamId?: string | null; productIds?: unknown; categoryIds?: unknown };
  const ownerTeamId = body.ownerTeamId?.trim() || null;
  const productIds = parseIdArray(body.productIds);
  const categoryIds = parseIdArray(body.categoryIds);

  if (!ownerTeamId && productIds.length === 0) {
    return res.status(400).json({ error: "at least one tag (team or product) is required" });
  }
  // Same "Others" fallback as upload — retagging down to zero categories
  // (e.g. moving a doc to a product with no tags set up yet) shouldn't be blocked.
  if (categoryIds.length === 0) {
    const fallbackScope = ownerTeamId ?? productIds[0];
    categoryIds.push(await getOrCreateOthersCategory(fallbackScope));
  }

  const [team, products, categories] = await Promise.all([
    ownerTeamId ? prisma.team.findUnique({ where: { id: ownerTeamId } }) : null,
    productIds.length ? prisma.product.findMany({ where: { id: { in: productIds } } }) : Promise.resolve([]),
    prisma.category.findMany({ where: { id: { in: categoryIds } } }),
  ]);
  if (ownerTeamId && !team) return res.status(400).json({ error: "ownerTeamId must be an existing team" });
  if (products.length !== productIds.length) {
    return res.status(400).json({ error: "one or more productIds do not exist" });
  }
  if (categories.length !== categoryIds.length) {
    return res.status(400).json({ error: "one or more categoryIds do not exist" });
  }
  const validScopes = new Set([ownerTeamId, ...productIds].filter((v): v is string => Boolean(v)));
  if (categories.some((c) => !validScopes.has(c.scope))) {
    return res.status(400).json({ error: "every category must be scoped to this team or a tagged product" });
  }

  if (req.user!.role === "ADMIN") {
    const scope = await loadAdminScope(req.user!.userId, req.user!.role);
    if (!canManageTeamOrProducts(scope, ownerTeamId, productIds)) {
      return res.status(403).json({ error: "You don't have admin access to the new team/product" });
    }
  }

  await prisma.$transaction([
    prisma.documentProduct.deleteMany({ where: { documentId: existing.id } }),
    prisma.documentCategory.deleteMany({ where: { documentId: existing.id } }),
    prisma.document.update({ where: { id: existing.id }, data: { ownerTeamId } }),
    ...productIds.map((productId) => prisma.documentProduct.create({ data: { documentId: existing.id, productId } })),
    ...categoryIds.map((categoryId) => prisma.documentCategory.create({ data: { documentId: existing.id, categoryId } })),
  ]);

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: "update_tags",
      targetId: existing.id,
      metadata: { ownerTeamId, productIds, categoryIds },
    },
  });

  const updated = await prisma.document.findUniqueOrThrow({ where: { id: existing.id }, include: documentInclude });
  res.json(serializeDocument(updated));
});

documentsRouter.patch<{ id: string }>("/:id/approve", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { products: true },
  });
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (doc.status !== "PENDING") {
    return res.status(409).json({ error: "Only pending documents can be approved" });
  }

  const scope = await loadAdminScope(req.user!.userId, req.user!.role);
  if (!canManageTeamOrProducts(scope, doc.ownerTeamId, doc.products.map((p) => p.productId))) {
    return res.status(403).json({ error: "You don't have admin access to this document's team/product" });
  }

  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: { status: "PUBLISHED", rejectionNote: null, publishedAt: new Date() },
    include: documentInclude,
  });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, action: "approve", targetId: doc.id },
  });
  await notifyDocumentApproved(
    { email: updated.uploadedBy.email, name: updated.uploadedBy.name },
    { id: updated.id, title: updated.title },
  );
  res.json(serializeDocument(updated));
});

documentsRouter.patch<{ id: string }>("/:id/reject", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const { note } = req.body as { note?: string };
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { products: true },
  });
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (doc.status !== "PENDING") {
    return res.status(409).json({ error: "Only pending documents can be rejected" });
  }

  const scope = await loadAdminScope(req.user!.userId, req.user!.role);
  if (!canManageTeamOrProducts(scope, doc.ownerTeamId, doc.products.map((p) => p.productId))) {
    return res.status(403).json({ error: "You don't have admin access to this document's team/product" });
  }

  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: { status: "REJECTED", rejectionNote: note?.trim() || null },
    include: documentInclude,
  });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, action: "reject", targetId: doc.id, metadata: { note: note ?? null } },
  });
  await notifyDocumentRejected(
    { email: updated.uploadedBy.email, name: updated.uploadedBy.name },
    { id: updated.id, title: updated.title },
    updated.rejectionNote,
  );
  res.json(serializeDocument(updated));
});

documentsRouter.post<{ id: string }>("/:id/request-deletion", requireAuth, async (req, res) => {
  const doc = await prisma.document.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!doc) return res.status(404).json({ error: "Document not found" });
  if (doc.deletionRequestedAt) {
    return res.status(409).json({ error: "Deletion has already been requested for this document" });
  }

  const { note } = req.body as { note?: string };
  const updated = await prisma.document.update({
    where: { id: doc.id },
    data: {
      deletionRequestedAt: new Date(),
      deletionRequestedById: req.user!.userId,
      deletionRequestNote: note?.trim() || null,
    },
    include: documentInclude,
  });
  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: "request_deletion",
      targetId: doc.id,
      metadata: { note: note?.trim() || null },
    },
  });
  const admins = await getAdminsForTeamOrProducts(
    updated.ownerTeamId,
    updated.products.map((p) => p.product.id),
  );
  await notifyDeletionRequested(admins, { id: updated.id, title: updated.title }, { name: updated.uploadedBy.name });
  res.status(201).json(serializeDocument(updated));
});

// PATCH /api/documents/:id/approve-deletion — Admin/Super Admin, same scope
// rule as approve/reject/delete. Carries out the requested soft-delete.
documentsRouter.patch<{ id: string }>(
  "/:id/approve-deletion",
  requireAuth,
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { products: true },
    });
    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (!doc.deletionRequestedAt) {
      return res.status(409).json({ error: "This document has no pending deletion request" });
    }

    const scope = await loadAdminScope(req.user!.userId, req.user!.role);
    if (!canManageTeamOrProducts(scope, doc.ownerTeamId, doc.products.map((p) => p.productId))) {
      return res.status(403).json({ error: "You don't have admin access to this document's team/product" });
    }

    // Captured before the update below nulls it — deletionRequestedById has
    // no Prisma relation (a bare id, same convention as
    // DocumentVersion.uploadedBy), and this is the only fetch of `doc` this
    // handler ever does.
    const requesterId = doc.deletionRequestedById;

    await prisma.document.update({
      where: { id: doc.id },
      data: {
        deletedAt: new Date(),
        deletionRequestedAt: null,
        deletionRequestedById: null,
        deletionRequestNote: null,
      },
    });
    // Logged as a plain "delete" — the Recycle Bin's deletedBy lookup (GET
    // /trash) keys off this exact action name, and this is a real deletion,
    // just one that started as someone else's request rather than an Admin
    // acting directly.
    await prisma.auditLog.create({
      data: { userId: req.user!.userId, action: "delete", targetId: doc.id },
    });

    if (requesterId) {
      const requester = await prisma.user.findUnique({ where: { id: requesterId }, select: { name: true, email: true } });
      if (requester) await notifyDeletionApproved(requester, { title: doc.title });
    }

    res.status(204).send();
  },
);

// PATCH /api/documents/:id/reject-deletion — Admin/Super Admin. Dismisses the
// request; the document is untouched otherwise (same status it already had).
documentsRouter.patch<{ id: string }>(
  "/:id/reject-deletion",
  requireAuth,
  requireRole("ADMIN", "SUPER_ADMIN"),
  async (req, res) => {
    const doc = await prisma.document.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { products: true },
    });
    if (!doc) return res.status(404).json({ error: "Document not found" });
    if (!doc.deletionRequestedAt) {
      return res.status(409).json({ error: "This document has no pending deletion request" });
    }

    const scope = await loadAdminScope(req.user!.userId, req.user!.role);
    if (!canManageTeamOrProducts(scope, doc.ownerTeamId, doc.products.map((p) => p.productId))) {
      return res.status(403).json({ error: "You don't have admin access to this document's team/product" });
    }

    // Captured before the update below nulls it — same convention as
    // approve-deletion above (no Prisma relation on deletionRequestedById).
    const requesterId = doc.deletionRequestedById;

    const updated = await prisma.document.update({
      where: { id: doc.id },
      data: { deletionRequestedAt: null, deletionRequestedById: null, deletionRequestNote: null },
      include: documentInclude,
    });
    await prisma.auditLog.create({
      data: { userId: req.user!.userId, action: "reject_deletion", targetId: doc.id },
    });

    if (requesterId) {
      const requester = await prisma.user.findUnique({ where: { id: requesterId }, select: { name: true, email: true } });
      if (requester) await notifyDeletionRejected(requester, { id: updated.id, title: updated.title });
    }

    res.json(serializeDocument(updated));
  },
);

documentsRouter.delete<{ id: string }>("/:id", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const doc = await prisma.document.findFirst({
    where: { id: req.params.id, deletedAt: null },
    include: { products: true },
  });
  if (!doc) return res.status(404).json({ error: "Document not found" });

  const scope = await loadAdminScope(req.user!.userId, req.user!.role);
  if (!canManageTeamOrProducts(scope, doc.ownerTeamId, doc.products.map((p) => p.productId))) {
    return res.status(403).json({ error: "You don't have admin access to this document's team/product" });
  }

  await prisma.document.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, action: "delete", targetId: doc.id },
  });
  res.status(204).send();
});

// A LINK document normally just hands back its stored external URL as-is —
// view-only enforcement for it is Drive's own share permissions, not
// something this app enforces (see CLAUDE.md §5). The exception: a Google
// Sheets or Docs link, for a user who's granted the drive.readonly scope,
// gets exported server-side (authenticated as that user, so it only works
// if they actually have Drive access) and routed through one of our own
// in-app viewers instead — same view-only guarantee a FILE upload gets,
// rather than opening Sheets/Docs' own UI where any viewer can still
// download. Doesn't verify access itself (that would mean calling Drive
// twice, once to check and once to actually fetch) — just checks "has this
// user ever granted the scope at all," and lets the export route's own 403
// be the real access check; the frontend falls back to the plain link on failure.
async function buildLinkViewResponse(externalUrl: string | null, documentId: string, userId: string) {
  const target = externalUrl ? getDriveExportTarget(externalUrl) : null;
  if (externalUrl && target) {
    const fileId = extractDriveFileId(externalUrl);
    const hasGoogleGrant = fileId
      ? await prisma.googleOAuthToken.findUnique({ where: { userId }, select: { userId: true } })
      : null;
    if (fileId && hasGoogleGrant) {
      const { url, expiresIn } = signDriveExportUrl(documentId, userId);
      return { url, sourceType: "FILE" as const, kind: target.kind, expiresIn, externalUrl };
    }
  }
  return { url: externalUrl, sourceType: "LINK" as const, expiresIn: null };
}

// Mirrors buildLinkViewResponse's "route through our own viewer instead of
// an external escape hatch" reasoning, but for FILE uploads: a docx/pptx
// with a converted preview (see office-preview.ts) is served as that PDF —
// kind: "pdf" routes the frontend into the in-app pdf.js viewer — and the
// raw docx/pptx's own signed URL is never returned to the browser at all.
// Falls back to the raw file when there's no preview (every other file
// type, or an Office file whose conversion failed at upload time).
async function buildFileViewResponse(s3Key: string, previewS3Key: string | null) {
  if (previewS3Key) {
    const { url, expiresIn } = await storage.getSignedUrl(previewS3Key);
    return { url, sourceType: "FILE" as const, kind: "pdf" as const, expiresIn };
  }
  const { url, expiresIn } = await storage.getSignedUrl(s3Key);
  return { url, sourceType: "FILE" as const, expiresIn };
}

documentsRouter.get<{ id: string }>("/:id/view-url", requireAuth, async (req, res) => {
  const doc = await prisma.document.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!doc) return res.status(404).json({ error: "Document not found" });

  const isOwner = doc.uploadedById === req.user!.userId;
  const isAdmin = isAdminRole(req.user!.role);
  // A rejected document's content is unopenable by anyone, including the
  // Admin who rejected it or the Super Admin — effectively a soft delete on
  // the file itself, not just a "not published yet" gate. Its metadata (the
  // GET /:id route below) is deliberately left reachable so the Approvals
  // rejected queue can still show what was rejected and why.
  if (doc.status === "REJECTED") {
    return res.status(403).json({ error: "This document was rejected and can no longer be viewed." });
  }
  if (doc.status !== "PUBLISHED" && !isOwner && !isAdmin) {
    return res.status(403).json({ error: "This document is not published yet" });
  }

  // Recorded so "Recents" can find it later — but "view" is deliberately left
  // out of DOCUMENT_ACTIONS in audit-log.ts, so it never shows up in the
  // admin-facing audit log (every open/preview would otherwise drown out the
  // actual upload/edit/delete history there).
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, action: "view", targetId: doc.id },
  });

  if (doc.sourceType === "LINK") {
    return res.json(await buildLinkViewResponse(doc.externalUrl, doc.id, req.user!.userId));
  }

  if (!doc.s3Key) {
    logger.error("published FILE document missing s3Key", { documentId: doc.id });
    return res.status(500).json({ error: "File is missing" });
  }
  res.json(await buildFileViewResponse(doc.s3Key, doc.previewS3Key));
});

// GET /api/documents/:id/drive-export?userId=&expires=&sig= — the actual
// bytes behind buildLinkViewResponse's exported-kind url above (Sheets or
// Docs — see getDriveExportTarget). Deliberately NOT behind requireAuth:
// it's fetched by SpreadsheetViewer/PdfViewer's plain client-side fetch(url)
// (same as an S3 presigned URL — no Authorization header attached), so a
// short-lived HMAC-signed query string is the auth here instead, same
// pattern as the local-disk storage adapter's /files route. The signature
// itself is bound to this exact (documentId, userId) pair, but
// exportDriveFile is the real access check — it only succeeds if that
// Google account genuinely has Drive access to the file. Doesn't trust a
// client-supplied format — re-derives which mime type to request (and
// which Content-Type to respond with) from the document's own externalUrl.
documentsRouter.get<{ id: string }>("/:id/drive-export", async (req, res) => {
  const { userId, expires, sig } = req.query as { userId?: string; expires?: string; sig?: string };
  const documentId = req.params.id;
  if (!userId || !expires || !sig || !verifyDriveExportRequest(documentId, userId, Number(expires), sig)) {
    return res.status(403).json({ error: "Invalid or expired link" });
  }

  const doc = await prisma.document.findFirst({ where: { id: documentId, deletedAt: null } });
  const target = doc?.externalUrl ? getDriveExportTarget(doc.externalUrl) : null;
  if (!doc || doc.sourceType !== "LINK" || !doc.externalUrl || !target) {
    return res.status(404).json({ error: "Not a Google Sheets or Docs document" });
  }

  const fileId = extractDriveFileId(doc.externalUrl);
  if (!fileId) return res.status(404).json({ error: "Could not resolve the file" });

  const bytes = await exportDriveFile(userId, fileId, target.exportMimeType);
  if (!bytes) {
    return res.status(403).json({ error: "You don't have access to this file, or your Google grant has expired" });
  }

  res.setHeader("Content-Type", target.exportMimeType);
  res.setHeader("Content-Disposition", "inline");
  res.send(bytes);
});

// GET /api/documents/:id/versions/:version/view-url — same view-only contract as
// the current-version endpoint above, but for a specific past version so Version
// History can open any prior file, not just the currently active one.
documentsRouter.get<{ id: string; version: string }>("/:id/versions/:version/view-url", requireAuth, async (req, res) => {
  const doc = await prisma.document.findFirst({ where: { id: req.params.id, deletedAt: null } });
  if (!doc) return res.status(404).json({ error: "Document not found" });

  const isOwner = doc.uploadedById === req.user!.userId;
  const isAdmin = isAdminRole(req.user!.role);
  // Same unconditional lockout as the current-version /view-url above — a
  // rejected document's file content (any version) is unopenable by anyone.
  if (doc.status === "REJECTED") {
    return res.status(403).json({ error: "This document was rejected and can no longer be viewed." });
  }
  if (doc.status !== "PUBLISHED" && !isOwner && !isAdmin) {
    return res.status(403).json({ error: "This document is not published yet" });
  }

  const versionNumber = Number(req.params.version);
  const version = await prisma.documentVersion.findFirst({
    where: { documentId: doc.id, version: versionNumber },
  });
  if (!version) return res.status(404).json({ error: "Version not found" });

  // Same reasoning as the current-version view-url above.
  await prisma.auditLog.create({
    data: { userId: req.user!.userId, action: "view", targetId: doc.id, metadata: { version: versionNumber } },
  });

  if (version.sourceType === "LINK") {
    return res.json(await buildLinkViewResponse(version.externalUrl, doc.id, req.user!.userId));
  }

  if (!version.s3Key) {
    logger.error("FILE version missing s3Key", { documentId: doc.id, version: versionNumber });
    return res.status(500).json({ error: "File is missing for this version" });
  }
  res.json(await buildFileViewResponse(version.s3Key, version.previewS3Key));
});

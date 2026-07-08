import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { isUniqueConstraintError } from "../lib/prisma-errors.js";
import { loadAdminScope, canManageTeamOrProducts } from "../lib/admin-scope.js";
import { reconcileDocumentFallbacks } from "../lib/fallback-entities.js";

export const categoriesRouter = Router();

categoriesRouter.get("/", requireAuth, async (req, res) => {
  const scope = req.query.scope;
  if (typeof scope !== "string" || !scope) {
    return res.status(400).json({ error: "scope query param is required" });
  }

  const categories = await prisma.category.findMany({
    where: { scope },
    orderBy: { name: "asc" },
    include: { _count: { select: { documents: { where: { document: { deletedAt: null } } } } } },
  });
  res.json(categories.map(({ _count, ...c }) => ({ ...c, documentCount: _count.documents })));
});

categoriesRouter.post("/", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const { name: rawName, scope } = req.body as { name?: string; scope?: string };
  const name = rawName?.trim();
  if (!name || !scope) {
    return res.status(400).json({ error: "name and scope are required" });
  }

  const [team, product] = await Promise.all([
    prisma.team.findUnique({ where: { id: scope } }),
    prisma.product.findUnique({ where: { id: scope } }),
  ]);
  if (!team && !product) {
    return res.status(400).json({ error: "scope must be an existing team or product id" });
  }
  // The "Others" team/product is a flat catch-all for content that doesn't
  // belong anywhere else — it isn't meant to grow its own category taxonomy.
  // Anything filed under it already gets the (per-scope) "Others" category
  // automatically (see fallback-entities.ts) without an admin curating more.
  if (team?.name === "Others" || product?.name === "Others") {
    return res.status(400).json({ error: "Categories can't be added to the Others team/product" });
  }

  const adminScope = await loadAdminScope(req.user!.userId, req.user!.role);
  const productIds = product ? [product.id] : [];
  if (!canManageTeamOrProducts(adminScope, team?.id, productIds)) {
    return res.status(403).json({ error: "You don't have admin access to this team/product" });
  }

  try {
    const category = await prisma.category.create({ data: { name, scope } });
    res.status(201).json(category);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({ error: "A category with that name already exists in this scope" });
    }
    throw err;
  }
});

// DELETE /api/categories/:id — Admin/Super Admin, gated by the same team/product
// scope check as creation. Documents that end up with zero categories after
// this tag is removed fall back to an "Others" category in the same scope.
categoriesRouter.delete<{ id: string }>("/:id", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const category = await prisma.category.findUnique({ where: { id: req.params.id } });
  if (!category) return res.status(404).json({ error: "Category not found" });
  if (category.name === "Others") {
    return res.status(400).json({ error: "The Others tag can't be deleted" });
  }

  const [team, product] = await Promise.all([
    prisma.team.findUnique({ where: { id: category.scope } }),
    prisma.product.findUnique({ where: { id: category.scope } }),
  ]);
  const adminScope = await loadAdminScope(req.user!.userId, req.user!.role);
  if (!canManageTeamOrProducts(adminScope, team?.id, product ? [product.id] : [])) {
    return res.status(403).json({ error: "You don't have admin access to this team/product" });
  }

  const affectedDocs = await prisma.documentCategory.findMany({
    where: { categoryId: category.id },
    select: { documentId: true },
  });

  await prisma.documentCategory.deleteMany({ where: { categoryId: category.id } });
  await prisma.category.delete({ where: { id: category.id } });

  for (const { documentId } of affectedDocs) {
    await reconcileDocumentFallbacks(documentId);
  }

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: "delete_category",
      targetId: category.id,
      metadata: { name: category.name, affectedDocuments: affectedDocs.length },
    },
  });
  res.status(204).send();
});

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

  // Global tags surface first (isGlobal: desc puts true before false),
  // alphabetical within each group — global categories are the ones an
  // admin deliberately made visible everywhere, so they should stand out
  // at the top of the list rather than being interleaved alphabetically.
  const categories = await prisma.category.findMany({
    where: { scope },
    orderBy: [{ isGlobal: "desc" }, { name: "asc" }],
    include: { _count: { select: { documents: { where: { document: { deletedAt: null } } } } } },
  });
  res.json(categories.map(({ _count, ...c }) => ({ ...c, documentCount: _count.documents })));
});

// GET /api/categories/global — distinct global category names (one entry per
// name, not one per underlying scope row) for the admin dashboard's Global
// categories section. Must come before the "/" GET route match is irrelevant
// here since Express matches by path, but it's declared here (above POST "/")
// to keep every "global"-related route grouped together.
categoriesRouter.get("/global", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (_req, res) => {
  const rows = await prisma.category.findMany({
    where: { isGlobal: true },
    select: { id: true, name: true, scope: true },
    orderBy: { name: "asc" },
  });

  const byName = new Map<string, string[]>();
  for (const r of rows) {
    const ids = byName.get(r.name) ?? [];
    ids.push(r.id);
    byName.set(r.name, ids);
  }

  const results = await Promise.all(
    [...byName.entries()].map(async ([name, ids]) => {
      const links = await prisma.documentCategory.findMany({
        where: { categoryId: { in: ids }, document: { deletedAt: null } },
        select: { documentId: true },
      });
      return {
        name,
        scopeCount: ids.length,
        documentCount: new Set(links.map((l) => l.documentId)).size,
      };
    }),
  );

  res.json(results);
});

// DELETE /api/categories/global/:name — removes a global category from every
// team/product at once (every row sharing that name and isGlobal: true).
// Same SUPER_ADMIN-only gate as creating one, since this is a platform-wide
// action, not something scoped to any single team/product an Admin manages.
categoriesRouter.delete<{ name: string }>("/global/:name", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  if (req.user!.role !== "SUPER_ADMIN") {
    return res.status(403).json({ error: "Only a Super Admin can delete a global category" });
  }
  const name = decodeURIComponent(req.params.name);
  const rows = await prisma.category.findMany({ where: { name, isGlobal: true } });
  if (rows.length === 0) return res.status(404).json({ error: "Global category not found" });

  const ids = rows.map((r) => r.id);
  const affectedDocs = await prisma.documentCategory.findMany({
    where: { categoryId: { in: ids } },
    select: { documentId: true },
  });

  await prisma.documentCategory.deleteMany({ where: { categoryId: { in: ids } } });
  await prisma.category.deleteMany({ where: { id: { in: ids } } });

  const distinctDocIds = [...new Set(affectedDocs.map((d) => d.documentId))];
  for (const documentId of distinctDocIds) {
    await reconcileDocumentFallbacks(documentId);
  }

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: "delete_global_category",
      targetId: name,
      metadata: { name, scopesRemoved: rows.length, affectedDocuments: distinctDocIds.length },
    },
  });
  res.status(204).send();
});

categoriesRouter.post("/", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const { name: rawName, scope } = req.body as { name?: string; scope?: string };
  const name = rawName?.trim();
  if (!name || !scope) {
    return res.status(400).json({ error: "name and scope are required" });
  }

  // "all" isn't a real scope id — a category is always stored per-team/
  // product (@@unique([name, scope]) in the schema), so a "global" category
  // is really the same name created under every team and product at once.
  // That's what makes it show up in each one's own filter chips/folder view,
  // and what lets the dashboard's "All" home merge same-named categories
  // from different scopes into a single filterable chip (see page.tsx's
  // categoryNameToIds). Restricted to SUPER_ADMIN only — even an
  // unrestricted (unscoped) ADMIN only manages the teams/products they were
  // actually made admin of; reaching into every team/product at once is a
  // platform-wide action, not something any Admin tier should do by default.
  if (scope === "all") {
    if (req.user!.role !== "SUPER_ADMIN") {
      return res.status(403).json({ error: "Only a Super Admin can create a global category" });
    }

    // Others is included here (unlike the regular per-scope creation path
    // below, which still blocks adding a scoped, non-global category to it)
    // — a global tag is supposed to mean "every team and product," and
    // that's genuinely true of Others too, not just an exception to it.
    const [teams, products] = await Promise.all([prisma.team.findMany(), prisma.product.findMany()]);

    const created: Awaited<ReturnType<typeof prisma.category.create>>[] = [];
    let skipped = 0;
    for (const target of [...teams, ...products]) {
      try {
        created.push(await prisma.category.create({ data: { name, scope: target.id, isGlobal: true } }));
      } catch (err) {
        if (isUniqueConstraintError(err)) {
          skipped++; // already exists in this scope — leave it, not an error
          continue;
        }
        throw err;
      }
    }

    await prisma.auditLog.create({
      data: {
        userId: req.user!.userId,
        action: "create_global_category",
        targetId: name,
        metadata: { name, createdCount: created.length, skippedCount: skipped },
      },
    });

    return res.status(201).json({ global: true, name, created, skipped });
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

import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { isUniqueConstraintError } from "../lib/prisma-errors.js";
import { loadAdminScope } from "../lib/admin-scope.js";
import { getOrCreateOthersProduct, reconcileDocumentFallbacks } from "../lib/fallback-entities.js";
import { backfillGlobalCategories } from "../lib/global-categories.js";

export const productsRouter = Router();

productsRouter.get("/", requireAuth, async (_req, res) => {
  const products = await prisma.product.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { documents: { where: { document: { deletedAt: null } } } } } },
  });
  res.json(
    products.map(({ _count, ...product }) => ({ ...product, documentCount: _count.documents })),
  );
});

productsRouter.post("/", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const name = (req.body as { name?: string }).name?.trim();
  if (!name) {
    return res.status(400).json({ error: "name is required" });
  }

  const scope = await loadAdminScope(req.user!.userId, req.user!.role);
  if (scope !== null) {
    return res.status(403).json({ error: "Only a global Admin or Super Admin can create new products" });
  }

  try {
    const product = await prisma.product.create({ data: { name } });
    await backfillGlobalCategories(product.id);
    res.status(201).json(product);
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return res.status(409).json({ error: "A product with that name already exists" });
    }
    throw err;
  }
});

// DELETE /api/products/:id — global Admin or Super Admin only. Same fallback
// treatment as team deletion: docs tagged with this product, and categories
// scoped to it, fall back to "Others" instead of being left dangling.
productsRouter.delete<{ id: string }>("/:id", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), async (req, res) => {
  const adminScope = await loadAdminScope(req.user!.userId, req.user!.role);
  if (adminScope !== null) {
    return res.status(403).json({ error: "Only a global Admin or Super Admin can delete products" });
  }

  const product = await prisma.product.findUnique({ where: { id: req.params.id } });
  if (!product) return res.status(404).json({ error: "Product not found" });
  if (product.name === "Others") {
    return res.status(400).json({ error: "The Others product can't be deleted" });
  }

  const categories = await prisma.category.findMany({ where: { scope: product.id } });
  const categoryIds = categories.map((c) => c.id);

  const affectedDocIds = new Set<string>();
  (
    await prisma.documentProduct.findMany({ where: { productId: product.id }, select: { documentId: true } })
  ).forEach((d) => affectedDocIds.add(d.documentId));
  if (categoryIds.length > 0) {
    (
      await prisma.documentCategory.findMany({ where: { categoryId: { in: categoryIds } }, select: { documentId: true } })
    ).forEach((d) => affectedDocIds.add(d.documentId));
  }

  await prisma.documentProduct.deleteMany({ where: { productId: product.id } });
  if (categoryIds.length > 0) {
    await prisma.documentCategory.deleteMany({ where: { categoryId: { in: categoryIds } } });
    await prisma.category.deleteMany({ where: { id: { in: categoryIds } } });
  }
  await prisma.adminScope.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });

  await getOrCreateOthersProduct();
  for (const docId of affectedDocIds) {
    await reconcileDocumentFallbacks(docId);
  }

  await prisma.auditLog.create({
    data: {
      userId: req.user!.userId,
      action: "delete_product",
      targetId: product.id,
      metadata: { name: product.name, affectedDocuments: affectedDocIds.size },
    },
  });
  res.status(204).send();
});

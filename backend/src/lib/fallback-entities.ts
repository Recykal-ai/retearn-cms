import { prisma } from "./prisma.js";

const OTHERS_NAME = "Others";

export async function getOrCreateOthersTeam(): Promise<string> {
  const existing = await prisma.team.findUnique({ where: { name: OTHERS_NAME } });
  if (existing) return existing.id;
  const created = await prisma.team.create({ data: { name: OTHERS_NAME } });
  return created.id;
}

export async function getOrCreateOthersProduct(): Promise<string> {
  const existing = await prisma.product.findUnique({ where: { name: OTHERS_NAME } });
  if (existing) return existing.id;
  const created = await prisma.product.create({ data: { name: OTHERS_NAME } });
  return created.id;
}

export async function getOrCreateOthersCategory(scope: string): Promise<string> {
  const existing = await prisma.category.findUnique({ where: { name_scope: { name: OTHERS_NAME, scope } } });
  if (existing) return existing.id;
  const created = await prisma.category.create({ data: { name: OTHERS_NAME, scope } });
  return created.id;
}

// Re-derives a document's current team/product/category state and backfills
// "Others" wherever a just-completed team/product/category deletion left it
// below the minimum tag requirements (§5: at least one team-or-product tag,
// at least one category tag). Safe to call after any tag-removal operation —
// it always reads fresh state rather than relying on stale data from before
// the deletion, so callers don't need to track what changed.
export async function reconcileDocumentFallbacks(documentId: string): Promise<void> {
  const doc = await prisma.document.findUnique({
    where: { id: documentId },
    include: { products: true, categories: true },
  });
  if (!doc) return;

  let ownerTeamId = doc.ownerTeamId;
  const productIds = doc.products.map((p) => p.productId);

  if (!ownerTeamId && productIds.length === 0) {
    ownerTeamId = await getOrCreateOthersTeam();
    await prisma.document.update({ where: { id: documentId }, data: { ownerTeamId } });
  }

  if (doc.categories.length === 0) {
    const scope = ownerTeamId ?? productIds[0];
    if (scope) {
      const othersCategoryId = await getOrCreateOthersCategory(scope);
      await prisma.documentCategory.create({ data: { documentId, categoryId: othersCategoryId } });
    }
  }
}

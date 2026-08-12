import { prisma } from "./prisma.js";
import { isUniqueConstraintError } from "./prisma-errors.js";

// A global category (Category.isGlobal — created via POST /api/categories
// with scope "all", see routes/categories.ts) fans out to every team/product
// that exists *at the moment it's created*. Without this, a team/product
// created afterward would never pick up an already-existing global tag,
// which breaks the "global" guarantee. Called from teams.ts/products.ts
// right after a new team/product is created.
export async function backfillGlobalCategories(scope: string): Promise<void> {
  const globalNames = await prisma.category.findMany({
    where: { isGlobal: true },
    select: { name: true },
    distinct: ["name"],
  });

  for (const { name } of globalNames) {
    try {
      await prisma.category.create({ data: { name, scope, isGlobal: true } });
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
    }
  }
}

// Tagging a document with a global category ("Goa DRS") is meant as one
// concept, even though it's stored as a separate row per scope — so it
// should apply everywhere the document itself already lives (every one of
// its own team+product scopes), not just whichever single scope's row
// happened to get picked in the UI. Called server-side on every document
// create/tag-update (routes/documents.ts) as a backstop: the upload/edit
// modals already compute the full expanded set client-side, but enforcing
// it here too means a stray direct API call, a future UI bug, or a bulk
// import can't silently reintroduce a document that's tagged Ace+Fastscan
// but only actually findable under, say, Marketing's copy of the tag.
export async function expandGlobalCategoryIds(categoryIds: string[], scopes: string[]): Promise<string[]> {
  if (categoryIds.length === 0 || scopes.length === 0) return categoryIds;
  const picked = await prisma.category.findMany({ where: { id: { in: categoryIds } } });
  const globalNames = [...new Set(picked.filter((c) => c.isGlobal).map((c) => c.name))];
  if (globalNames.length === 0) return categoryIds;
  const siblings = await prisma.category.findMany({
    where: { name: { in: globalNames }, isGlobal: true, scope: { in: scopes } },
    select: { id: true },
  });
  return [...new Set([...categoryIds, ...siblings.map((s) => s.id)])];
}

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

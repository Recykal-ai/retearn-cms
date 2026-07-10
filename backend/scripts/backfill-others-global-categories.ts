// One-off: retroactively backfills existing global categories into the
// already-created "Others" team/product, for installs where Others existed
// before global categories were made to include it (see global-categories.ts).
// Safe to re-run — backfillGlobalCategories skips names that already exist
// in a given scope.
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { backfillGlobalCategories } from "../src/lib/global-categories.js";

const othersTeam = await prisma.team.findUnique({ where: { name: "Others" } });
const othersProduct = await prisma.product.findUnique({ where: { name: "Others" } });

if (othersTeam) {
  await backfillGlobalCategories(othersTeam.id);
  console.log("Backfilled Others team:", othersTeam.id);
}
if (othersProduct) {
  await backfillGlobalCategories(othersProduct.id);
  console.log("Backfilled Others product:", othersProduct.id);
}
process.exit(0);

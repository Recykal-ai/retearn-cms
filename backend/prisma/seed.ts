import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client.js";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const TEAMS = ["AI", "Marketing", "Embedded", "Software", "QA", "Ops"];
const PRODUCTS = ["Pro", "Ace", "Go", "Fastscan"];

async function main() {
  for (const name of TEAMS) {
    await prisma.team.upsert({ where: { name }, update: {}, create: { name } });
  }

  for (const name of PRODUCTS) {
    await prisma.product.upsert({ where: { name }, update: {}, create: { name } });
  }

  // The one bootstrap Super Admin — promotes others to ADMIN via
  // PATCH /api/users/:id/role. Never self-registered via Google.
  await prisma.user.upsert({
    where: { email: "siddhide.panchwadkar@recykal.com" },
    update: { role: "SUPER_ADMIN" },
    create: {
      email: "siddhide.panchwadkar@recykal.com",
      name: "Siddhide Panchwadkar",
      role: "SUPER_ADMIN",
    },
  });

  console.log(`Seeded ${TEAMS.length} teams, ${PRODUCTS.length} products, 1 super admin.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

// Dev-only helper: prints a JWT for an existing user, so protected endpoints
// can be curl'd without going through the real Google OAuth flow.
// Usage: npm run token -- someone@recykal.com
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { signAppJwt } from "../src/lib/jwt.js";

const email = process.argv[2] ?? "siddhide.panchwadkar@recykal.com";

const user = await prisma.user.findUniqueOrThrow({ where: { email } });
console.log(signAppJwt({ userId: user.id, role: user.role }));
await prisma.$disconnect();

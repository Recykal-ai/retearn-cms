import { Router } from "express";
import { OAuth2Client } from "google-auth-library";
import { prisma } from "../lib/prisma.js";
import { signAppJwt } from "../lib/jwt.js";
import { requireAuth } from "../middleware/auth.js";
import { logger } from "../lib/logger.js";
import { loadAdminScope } from "../lib/admin-scope.js";

const ALLOWED_DOMAIN = "recykal.com";
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
if (!GOOGLE_CLIENT_ID) {
  throw new Error("GOOGLE_CLIENT_ID env var is required");
}

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

export const authRouter = Router();

// Exchanges a Google ID token (already verified once by NextAuth on the
// frontend, but re-verified here since the backend is the source of truth
// for who's allowed in) for our own short-lived JWT, auto-provisioning the
// User row on first sign-in.
authRouter.post("/google", async (req, res) => {
  const { idToken } = req.body as { idToken?: string };
  if (!idToken) {
    return res.status(400).json({ error: "idToken is required" });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    logger.warn("google id token verification failed", { err: String(err) });
    return res.status(401).json({ error: "Invalid Google ID token" });
  }

  const email = payload?.email?.toLowerCase();
  if (!payload || !email || !payload.email_verified) {
    return res.status(401).json({ error: "Invalid Google ID token" });
  }
  if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
    return res.status(403).json({ error: `Only @${ALLOWED_DOMAIN} accounts are allowed` });
  }

  // `update` refreshes the name on every login — matters for accounts a Super
  // Admin pre-invited by email before this person ever signed in, where the
  // row was created with a placeholder name (no Google profile to draw from
  // yet). Role is deliberately untouched here so a pre-granted Admin role
  // survives the user's first real login. `active: true` means signing back
  // in after being removed has no restriction — it just un-hides them from
  // the Access list again, same role/scope as before.
  const user = await prisma.user.upsert({
    where: { email },
    update: { name: payload.name ?? email, active: true },
    create: {
      email,
      name: payload.name ?? email,
      role: "USER",
    },
  });

  const token = signAppJwt({ userId: user.id, role: user.role });
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  const scope = await loadAdminScope(user.id, user.role);
  res.json({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    // null = unrestricted (Super Admin, or an Admin with no scope rows = global admin)
    adminScope: scope ? { teamIds: [...scope.teamIds], productIds: [...scope.productIds] } : null,
  });
});

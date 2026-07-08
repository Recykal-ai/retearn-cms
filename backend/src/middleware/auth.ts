import type { NextFunction, Request, Response } from "express";
import { verifyAppJwt, type AppJwtPayload } from "../lib/jwt.js";
import { prisma } from "../lib/prisma.js";

declare global {
  namespace Express {
    interface Request {
      user?: AppJwtPayload;
    }
  }
}

// Deliberately does one DB lookup per request rather than trusting the JWT's
// role/active snapshot — a Super Admin deactivating someone (or changing
// their role) needs to take effect on the very next request, not whenever
// that person's up-to-12h token happens to expire. This is a conscious
// trade-off away from the fully-stateless-JWT design for correctness; at this
// app's scale (~300 users) an indexed lookup per request is not a real cost.
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) {
    return res.status(401).json({ error: "Missing bearer token" });
  }

  let payload: AppJwtPayload;
  try {
    payload = verifyAppJwt(token);
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }

  const user = await prisma.user.findUnique({
    where: { id: payload.userId },
    select: { active: true, role: true },
  });
  if (!user || !user.active) {
    return res.status(401).json({ error: "This account has been deactivated" });
  }

  // Use the DB's current role, not the token's snapshot — a demotion/promotion
  // also takes effect immediately, not just deactivation.
  req.user = { ...payload, role: user.role };
  next();
}

export function requireRole(...roles: AppJwtPayload["role"][]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Missing bearer token" });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

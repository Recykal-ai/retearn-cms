import jwt from "jsonwebtoken";
import type { Role } from "../generated/prisma/enums.js";

const envSecret = process.env.JWT_SECRET;
if (!envSecret) {
  throw new Error("JWT_SECRET env var is required");
}
const JWT_SECRET: string = envSecret;

export interface AppJwtPayload {
  userId: string;
  role: Role;
}

export function signAppJwt(payload: AppJwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "12h", algorithm: "HS256" });
}

// Pinning the algorithm here is deliberate defense-in-depth (OWASP JWT
// guidance) — without it, verify() infers the algorithm from the token's own
// header, which is the class of bug behind "alg confusion" JWT attacks.
export function verifyAppJwt(token: string): AppJwtPayload {
  return jwt.verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as unknown as AppJwtPayload;
}

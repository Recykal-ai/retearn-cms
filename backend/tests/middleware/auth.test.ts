import { describe, it, expect } from "vitest";
import express from "express";
import request from "supertest";
import jwt from "jsonwebtoken";
import { requireAuth, requireRole } from "../../src/middleware/auth.js";
import { signAppJwt } from "../../src/lib/jwt.js";
import { createTestUser, authHeaderFor } from "../helpers/auth.js";

// A minimal standalone app wired directly to the real middleware — isolates
// this from any particular route's business logic, which is tested
// separately (documents.test.ts, team-notes.test.ts).
const testApp = express();
testApp.get("/protected", requireAuth, (req, res) => {
  res.json({ userId: req.user!.userId, role: req.user!.role });
});
testApp.get("/admin-only", requireAuth, requireRole("ADMIN", "SUPER_ADMIN"), (req, res) => {
  res.json({ ok: true });
});
// requireRole's own "missing req.user" guard clause — not reachable via a
// normal route (requireAuth always runs first), so exercised directly here.
testApp.get("/role-only", requireRole("ADMIN"), (req, res) => {
  res.json({ ok: true });
});

describe("requireAuth", () => {
  it("401s with no Authorization header", async () => {
    const res = await request(testApp).get("/protected");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Missing bearer token");
  });

  it("401s on a malformed header (no Bearer prefix)", async () => {
    const res = await request(testApp).get("/protected").set("Authorization", "Token abc123");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Missing bearer token");
  });

  it("401s on an invalid/garbage JWT", async () => {
    const res = await request(testApp).get("/protected").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid or expired token");
  });

  it("401s on a JWT signed with the wrong secret", async () => {
    const badToken = jwt.sign({ userId: "whatever", role: "USER" }, "wrong-secret", { algorithm: "HS256" });
    const res = await request(testApp).get("/protected").set("Authorization", `Bearer ${badToken}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Invalid or expired token");
  });

  it("401s when the token's userId doesn't exist in the DB (same message as deactivated)", async () => {
    const token = signAppJwt({ userId: "00000000-0000-0000-0000-000000000000", role: "USER" });
    const res = await request(testApp).get("/protected").set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("This account has been deactivated");
  });

  it("401s for a deactivated user", async () => {
    const user = await createTestUser("USER", { active: false });
    const res = await request(testApp).get("/protected").set(authHeaderFor(user));
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("This account has been deactivated");
  });

  it("passes through for a valid, active user, with req.user.role from the LIVE DB row — not the JWT payload", async () => {
    const user = await createTestUser("ADMIN");
    // Mint a token that *claims* USER for a user who is actually ADMIN in
    // the DB — requireAuth must trust the DB, never the token's own claim.
    const spoofedToken = signAppJwt({ userId: user.id, role: "USER" });
    const res = await request(testApp).get("/protected").set("Authorization", `Bearer ${spoofedToken}`);
    expect(res.status).toBe(200);
    expect(res.body.userId).toBe(user.id);
    expect(res.body.role).toBe("ADMIN");
  });
});

describe("requireRole", () => {
  it("403s a USER hitting an admin-only route", async () => {
    const user = await createTestUser("USER");
    const res = await request(testApp).get("/admin-only").set(authHeaderFor(user));
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("Forbidden");
  });

  it("passes an ADMIN through to an admin-only route", async () => {
    const user = await createTestUser("ADMIN");
    const res = await request(testApp).get("/admin-only").set(authHeaderFor(user));
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });

  it("401s when req.user was never set (requireRole used without requireAuth first)", async () => {
    const res = await request(testApp).get("/role-only");
    expect(res.status).toBe(401);
    expect(res.body.error).toBe("Missing bearer token");
  });
});

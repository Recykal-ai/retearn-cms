import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createTestUser, authHeaderFor } from "../helpers/auth.js";
import {
  notifyDocumentPending,
  notifyDocumentApproved,
  notifyDocumentRejected,
  notifyDeletionRequested,
  notifyDeletionApproved,
  notifyDeletionRejected,
} from "../../src/lib/notification-emails.js";

// Every notify* function mocked — these routes must never attempt a real
// Gmail SMTP send in tests. Mocking notification-emails.ts itself (not
// email.ts) so assertions target domain-meaningful calls (who got notified,
// about which document) rather than rendered HTML strings.
vi.mock("../../src/lib/notification-emails.js", () => ({
  notifyDocumentPending: vi.fn(),
  notifyDocumentApproved: vi.fn(),
  notifyDocumentRejected: vi.fn(),
  notifyDeletionRequested: vi.fn(),
  notifyDeletionApproved: vi.fn(),
  notifyDeletionRejected: vi.fn(),
  notifyMentioned: vi.fn(),
}));

async function makeTeam(name = "Team A") {
  return prisma.team.create({ data: { name } });
}

function linkUploadBody(overrides: Record<string, unknown> = {}) {
  return {
    sourceType: "LINK",
    title: "A linked doc",
    externalUrl: "https://docs.example.com/thing",
    productIds: [],
    categoryIds: [],
    ...overrides,
  };
}

describe("POST /api/documents — autoPublish branching", () => {
  it("a USER's upload always lands PENDING, regardless of team", async () => {
    const user = await createTestUser("USER");
    const team = await makeTeam();
    const res = await request(app)
      .post("/api/documents")
      .set(authHeaderFor(user))
      .send(linkUploadBody({ ownerTeamId: team.id }));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
    expect(vi.mocked(notifyDocumentPending)).toHaveBeenCalledTimes(1);
  });

  it("a scoped ADMIN uploading OUTSIDE their scope lands PENDING, same as a USER", async () => {
    const admin = await createTestUser("ADMIN");
    const teamA = await makeTeam("Team A");
    const teamB = await makeTeam("Team B");
    await prisma.adminScope.create({ data: { userId: admin.id, teamId: teamA.id } });

    const res = await request(app)
      .post("/api/documents")
      .set(authHeaderFor(admin))
      .send(linkUploadBody({ ownerTeamId: teamB.id }));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PENDING");
  });

  it("a scoped ADMIN uploading WITHIN their scope auto-publishes", async () => {
    const admin = await createTestUser("ADMIN");
    const team = await makeTeam();
    await prisma.adminScope.create({ data: { userId: admin.id, teamId: team.id } });

    const res = await request(app)
      .post("/api/documents")
      .set(authHeaderFor(admin))
      .send(linkUploadBody({ ownerTeamId: team.id }));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PUBLISHED");
    expect(vi.mocked(notifyDocumentPending)).not.toHaveBeenCalled();
  });

  it("a global (zero-scope) ADMIN always auto-publishes", async () => {
    const admin = await createTestUser("ADMIN");
    const team = await makeTeam();
    const res = await request(app)
      .post("/api/documents")
      .set(authHeaderFor(admin))
      .send(linkUploadBody({ ownerTeamId: team.id }));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PUBLISHED");
  });

  it("SUPER_ADMIN always auto-publishes", async () => {
    const superAdmin = await createTestUser("SUPER_ADMIN");
    const team = await makeTeam();
    const res = await request(app)
      .post("/api/documents")
      .set(authHeaderFor(superAdmin))
      .send(linkUploadBody({ ownerTeamId: team.id }));
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("PUBLISHED");
  });

  it("400s with neither a team nor a product tagged", async () => {
    const user = await createTestUser("USER");
    const res = await request(app).post("/api/documents").set(authHeaderFor(user)).send(linkUploadBody());
    expect(res.status).toBe(400);
  });
});

async function createPendingDocument(ownerTeamId: string, uploaderId: string) {
  return prisma.document.create({
    data: {
      title: "Pending doc",
      status: "PENDING",
      ownerTeamId,
      uploadedById: uploaderId,
      sourceType: "LINK",
      externalUrl: "https://docs.example.com/pending",
    },
  });
}

describe("PATCH /api/documents/:id/approve + /reject", () => {
  it("approve: PENDING -> PUBLISHED, notifies the uploader", async () => {
    const uploader = await createTestUser("USER");
    const admin = await createTestUser("ADMIN");
    const team = await makeTeam();
    const doc = await createPendingDocument(team.id, uploader.id);

    const res = await request(app).patch(`/api/documents/${doc.id}/approve`).set(authHeaderFor(admin));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("PUBLISHED");
    expect(vi.mocked(notifyDocumentApproved)).toHaveBeenCalledWith(
      expect.objectContaining({ email: uploader.email }),
      expect.objectContaining({ id: doc.id }),
    );
  });

  it("approve: 409 when the document isn't PENDING", async () => {
    const uploader = await createTestUser("USER");
    const admin = await createTestUser("ADMIN");
    const team = await makeTeam();
    const doc = await createPendingDocument(team.id, uploader.id);
    await prisma.document.update({ where: { id: doc.id }, data: { status: "PUBLISHED" } });

    const res = await request(app).patch(`/api/documents/${doc.id}/approve`).set(authHeaderFor(admin));
    expect(res.status).toBe(409);
  });

  it("approve: 403 for an ADMIN scoped to a different team", async () => {
    const uploader = await createTestUser("USER");
    const outOfScopeAdmin = await createTestUser("ADMIN");
    const teamA = await makeTeam("Team A");
    const teamB = await makeTeam("Team B");
    await prisma.adminScope.create({ data: { userId: outOfScopeAdmin.id, teamId: teamB.id } });
    const doc = await createPendingDocument(teamA.id, uploader.id);

    const res = await request(app).patch(`/api/documents/${doc.id}/approve`).set(authHeaderFor(outOfScopeAdmin));
    expect(res.status).toBe(403);
  });

  it("approve: 403 for a plain USER (blocked by requireRole before the handler)", async () => {
    const uploader = await createTestUser("USER");
    const otherUser = await createTestUser("USER");
    const team = await makeTeam();
    const doc = await createPendingDocument(team.id, uploader.id);

    const res = await request(app).patch(`/api/documents/${doc.id}/approve`).set(authHeaderFor(otherUser));
    expect(res.status).toBe(403);
  });

  it("reject: PENDING -> REJECTED with a note, notifies the uploader", async () => {
    const uploader = await createTestUser("USER");
    const admin = await createTestUser("ADMIN");
    const team = await makeTeam();
    const doc = await createPendingDocument(team.id, uploader.id);

    const res = await request(app)
      .patch(`/api/documents/${doc.id}/reject`)
      .set(authHeaderFor(admin))
      .send({ note: "not the right file" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("REJECTED");
    expect(res.body.rejectionNote).toBe("not the right file");
    expect(vi.mocked(notifyDocumentRejected)).toHaveBeenCalledWith(
      expect.objectContaining({ email: uploader.email }),
      expect.objectContaining({ id: doc.id }),
      "not the right file",
    );
  });
});

describe("Deletion request/approve/reject trio", () => {
  async function createPublishedDocument(ownerTeamId: string, uploaderId: string) {
    return prisma.document.create({
      data: {
        title: "Published doc",
        status: "PUBLISHED",
        publishedAt: new Date(),
        ownerTeamId,
        uploadedById: uploaderId,
        sourceType: "LINK",
        externalUrl: "https://docs.example.com/published",
      },
    });
  }

  it("request-deletion sets deletionRequestedAt/By and notifies admins", async () => {
    const uploader = await createTestUser("USER");
    const requester = await createTestUser("USER");
    const team = await makeTeam();
    const doc = await createPublishedDocument(team.id, uploader.id);

    const res = await request(app)
      .post(`/api/documents/${doc.id}/request-deletion`)
      .set(authHeaderFor(requester))
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.deletionRequestedById).toBe(requester.id);
    expect(vi.mocked(notifyDeletionRequested)).toHaveBeenCalledTimes(1);
  });

  it("request-deletion twice on the same doc 409s", async () => {
    const uploader = await createTestUser("USER");
    const requester = await createTestUser("USER");
    const team = await makeTeam();
    const doc = await createPublishedDocument(team.id, uploader.id);
    await request(app).post(`/api/documents/${doc.id}/request-deletion`).set(authHeaderFor(requester)).send({});

    const res = await request(app)
      .post(`/api/documents/${doc.id}/request-deletion`)
      .set(authHeaderFor(requester))
      .send({});
    expect(res.status).toBe(409);
  });

  it("approve-deletion soft-deletes the doc and notifies the ORIGINAL REQUESTER — not the uploader", async () => {
    const uploader = await createTestUser("USER");
    const requester = await createTestUser("USER", { name: "Requesting Person" });
    const admin = await createTestUser("ADMIN");
    const team = await makeTeam();
    const doc = await createPublishedDocument(team.id, uploader.id);
    await prisma.document.update({
      where: { id: doc.id },
      data: { deletionRequestedAt: new Date(), deletionRequestedById: requester.id },
    });

    const res = await request(app).patch(`/api/documents/${doc.id}/approve-deletion`).set(authHeaderFor(admin));
    expect(res.status).toBe(204);

    const updated = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
    expect(updated.deletedAt).not.toBeNull();
    expect(updated.deletionRequestedById).toBeNull();

    // The load-bearing assertion: deletionRequestedById gets nulled by this
    // very update, so notifyDeletionApproved must have been called with the
    // requester's info captured BEFORE that happened — not the uploader's,
    // and not silently skipped.
    expect(vi.mocked(notifyDeletionApproved)).toHaveBeenCalledWith(
      expect.objectContaining({ email: requester.email }),
      expect.objectContaining({ title: doc.title }),
    );
  });

  it("reject-deletion clears the request, leaves the doc published, notifies the requester", async () => {
    const uploader = await createTestUser("USER");
    const requester = await createTestUser("USER");
    const admin = await createTestUser("ADMIN");
    const team = await makeTeam();
    const doc = await createPublishedDocument(team.id, uploader.id);
    await prisma.document.update({
      where: { id: doc.id },
      data: { deletionRequestedAt: new Date(), deletionRequestedById: requester.id },
    });

    const res = await request(app).patch(`/api/documents/${doc.id}/reject-deletion`).set(authHeaderFor(admin));
    expect(res.status).toBe(200);
    expect(res.body.deletionRequestedAt).toBeNull();
    expect(res.body.status).toBe("PUBLISHED");
    expect(vi.mocked(notifyDeletionRejected)).toHaveBeenCalledWith(
      expect.objectContaining({ email: requester.email }),
      expect.objectContaining({ id: doc.id }),
    );
  });
});

async function createPublishedDocument(ownerTeamId: string, uploaderId: string) {
  return prisma.document.create({
    data: {
      title: "Published doc",
      status: "PUBLISHED",
      ownerTeamId,
      uploadedById: uploaderId,
      sourceType: "LINK",
      externalUrl: "https://docs.example.com/published",
    },
  });
}

describe("GET /api/documents — uploadedBy filter", () => {
  it("narrows the list to only the given uploader's PUBLISHED docs", async () => {
    const alice = await createTestUser("USER");
    const bob = await createTestUser("USER");
    const viewer = await createTestUser("USER");
    const team = await makeTeam();
    const aliceDoc = await createPublishedDocument(team.id, alice.id);
    await createPublishedDocument(team.id, bob.id);

    const res = await request(app)
      .get(`/api/documents?uploadedBy=${alice.id}`)
      .set(authHeaderFor(viewer));
    expect(res.status).toBe(200);
    expect(res.body.map((d: { id: string }) => d.id)).toEqual([aliceDoc.id]);
  });

  it("a non-admin's Pending view stays restricted to their own docs even with an unrelated uploadedBy filter", async () => {
    const user = await createTestUser("USER");
    const otherUser = await createTestUser("USER");
    const team = await makeTeam();
    await createPendingDocument(team.id, user.id);
    await createPendingDocument(team.id, otherUser.id);

    const res = await request(app)
      .get(`/api/documents?status=PENDING&uploadedBy=${otherUser.id}`)
      .set(authHeaderFor(user));
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });
});

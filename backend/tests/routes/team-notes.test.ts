import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { app } from "../../src/app.js";
import { prisma } from "../../src/lib/prisma.js";
import { createTestUser, authHeaderFor } from "../helpers/auth.js";
import { notifyMentioned } from "../../src/lib/notification-emails.js";

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

async function makeTeamNoteWithMembers(teamId: string, creatorId: string, memberIds: string[]) {
  const note = await prisma.teamNote.create({
    data: {
      teamId,
      title: "A team note",
      createdById: creatorId,
      members: { create: [...new Set([creatorId, ...memberIds])].map((userId) => ({ userId, addedById: creatorId })) },
    },
  });
  return note;
}

describe("Membership gating (isTeamNoteMember) vs curator gating (canCurateTeamNote/Notes)", () => {
  it("a member can GET the note", async () => {
    const team = await makeTeam();
    const member = await createTestUser("USER");
    const note = await makeTeamNoteWithMembers(team.id, member.id, []);

    const res = await request(app).get(`/api/team-notes/${note.id}`).set(authHeaderFor(member));
    expect(res.status).toBe(200);
  });

  it("a non-member is denied — including a SUPER_ADMIN with no membership row (no role-based bypass)", async () => {
    const team = await makeTeam();
    const creator = await createTestUser("USER");
    const note = await makeTeamNoteWithMembers(team.id, creator.id, []);
    const superAdmin = await createTestUser("SUPER_ADMIN");

    const res = await request(app).get(`/api/team-notes/${note.id}`).set(authHeaderFor(superAdmin));
    expect(res.status).toBe(403);
  });

  it("POST / (create) is curator-only — a plain USER is denied", async () => {
    const team = await makeTeam();
    const user = await createTestUser("USER");
    const res = await request(app)
      .post("/api/team-notes")
      .set(authHeaderFor(user))
      .send({ teamId: team.id, title: "New note" });
    expect(res.status).toBe(403);
  });

  it("POST / (create) succeeds for a global ADMIN, and auto-adds the creator as a member", async () => {
    const team = await makeTeam();
    const admin = await createTestUser("ADMIN");
    const res = await request(app)
      .post("/api/team-notes")
      .set(authHeaderFor(admin))
      .send({ teamId: team.id, title: "New note" });
    expect(res.status).toBe(201);

    const membership = await prisma.teamNoteMembership.findUnique({
      where: { userId_teamNoteId: { userId: admin.id, teamNoteId: res.body.id } },
    });
    expect(membership).not.toBeNull();
  });

  it("DELETE /:id is denied for an ADMIN scoped to a different team", async () => {
    const teamA = await makeTeam("Team A");
    const teamB = await makeTeam("Team B");
    const creator = await createTestUser("USER");
    const note = await makeTeamNoteWithMembers(teamA.id, creator.id, []);
    const outOfScopeAdmin = await createTestUser("ADMIN");
    await prisma.adminScope.create({ data: { userId: outOfScopeAdmin.id, teamId: teamB.id } });

    const res = await request(app).delete(`/api/team-notes/${note.id}`).set(authHeaderFor(outOfScopeAdmin));
    expect(res.status).toBe(403);
  });

  it("DELETE /:id succeeds for an in-scope ADMIN", async () => {
    const team = await makeTeam();
    const creator = await createTestUser("USER");
    const note = await makeTeamNoteWithMembers(team.id, creator.id, []);
    const inScopeAdmin = await createTestUser("ADMIN");
    await prisma.adminScope.create({ data: { userId: inScopeAdmin.id, teamId: team.id } });

    const res = await request(app).delete(`/api/team-notes/${note.id}`).set(authHeaderFor(inScopeAdmin));
    expect(res.status).toBe(204);
  });
});

describe("Content mentions (PUT /:id)", () => {
  it("mentioning a member creates a Notification and calls notifyMentioned", async () => {
    const team = await makeTeam();
    const author = await createTestUser("USER");
    const mentioned = await createTestUser("USER");
    const note = await makeTeamNoteWithMembers(team.id, author.id, [mentioned.id]);

    const res = await request(app)
      .put(`/api/team-notes/${note.id}`)
      .set(authHeaderFor(author))
      .send({ content: `<p>Hey <span data-type="mention" data-id="${mentioned.id}">Someone</span></p>` });
    expect(res.status).toBe(200);

    const notifications = await prisma.notification.findMany({ where: { teamNoteId: note.id, userId: mentioned.id } });
    expect(notifications).toHaveLength(1);
    expect(vi.mocked(notifyMentioned)).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ email: mentioned.email })]),
      expect.anything(),
      expect.objectContaining({ id: note.id }),
    );
  });

  it("mentioning the same person twice in one save only creates one Notification", async () => {
    const team = await makeTeam();
    const author = await createTestUser("USER");
    const mentioned = await createTestUser("USER");
    const note = await makeTeamNoteWithMembers(team.id, author.id, [mentioned.id]);

    await request(app)
      .put(`/api/team-notes/${note.id}`)
      .set(authHeaderFor(author))
      .send({
        content: `<p><span data-type="mention" data-id="${mentioned.id}">A</span> and again <span data-type="mention" data-id="${mentioned.id}">A</span></p>`,
      });

    const notifications = await prisma.notification.findMany({ where: { teamNoteId: note.id, userId: mentioned.id } });
    expect(notifications).toHaveLength(1);
  });

  it("mentioning yourself never notifies", async () => {
    const team = await makeTeam();
    const author = await createTestUser("USER");
    const note = await makeTeamNoteWithMembers(team.id, author.id, []);

    await request(app)
      .put(`/api/team-notes/${note.id}`)
      .set(authHeaderFor(author))
      .send({ content: `<p><span data-type="mention" data-id="${author.id}">Me</span></p>` });

    const notifications = await prisma.notification.findMany({ where: { teamNoteId: note.id } });
    expect(notifications).toHaveLength(0);
    expect(vi.mocked(notifyMentioned)).not.toHaveBeenCalled();
  });
});

describe("Comment mentions (POST /:id/comments)", () => {
  it("mentioning a member creates a Notification and calls notifyMentioned, anchored to the new comment", async () => {
    const team = await makeTeam();
    const author = await createTestUser("USER");
    const mentioned = await createTestUser("USER");
    const note = await makeTeamNoteWithMembers(team.id, author.id, [mentioned.id]);

    const res = await request(app)
      .post(`/api/team-notes/${note.id}/comments`)
      .set(authHeaderFor(author))
      .send({ quotedText: "some text", body: "look at this", mentionedUserIds: [mentioned.id] });
    expect(res.status).toBe(201);

    const notifications = await prisma.notification.findMany({ where: { teamNoteId: note.id, userId: mentioned.id } });
    expect(notifications).toHaveLength(1);
    expect(vi.mocked(notifyMentioned)).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ email: mentioned.email })]),
      expect.anything(),
      expect.objectContaining({ id: note.id }),
      res.body.id,
    );
  });

  it("duplicate ids in mentionedUserIds only create one Notification", async () => {
    const team = await makeTeam();
    const author = await createTestUser("USER");
    const mentioned = await createTestUser("USER");
    const note = await makeTeamNoteWithMembers(team.id, author.id, [mentioned.id]);

    await request(app)
      .post(`/api/team-notes/${note.id}/comments`)
      .set(authHeaderFor(author))
      .send({ body: "hello", mentionedUserIds: [mentioned.id, mentioned.id] });

    const notifications = await prisma.notification.findMany({ where: { teamNoteId: note.id, userId: mentioned.id } });
    expect(notifications).toHaveLength(1);
  });

  it("mentioning yourself in a comment never notifies", async () => {
    const team = await makeTeam();
    const author = await createTestUser("USER");
    const note = await makeTeamNoteWithMembers(team.id, author.id, []);

    await request(app)
      .post(`/api/team-notes/${note.id}/comments`)
      .set(authHeaderFor(author))
      .send({ body: "note to self", mentionedUserIds: [author.id] });

    const notifications = await prisma.notification.findMany({ where: { teamNoteId: note.id } });
    expect(notifications).toHaveLength(0);
  });
});

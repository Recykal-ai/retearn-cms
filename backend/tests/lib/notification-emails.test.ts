import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendEmail } from "../../src/lib/email.js";
import {
  notifyDocumentPending,
  notifyDocumentApproved,
  notifyDocumentRejected,
  notifyDeletionRequested,
  notifyDeletionApproved,
  notifyDeletionRejected,
  notifyMentioned,
} from "../../src/lib/notification-emails.js";

// Only sendEmail is mocked — buildEmailHtml runs for real, so these tests
// verify the ACTUAL rendered subject/CTA URL/body content each event
// produces, not just that some notify function was called (that's already
// covered by documents.test.ts/team-notes.test.ts's route-level mocks).
vi.mock("../../src/lib/email.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/lib/email.js")>();
  return { ...actual, sendEmail: vi.fn().mockResolvedValue(undefined) };
});

const FRONTEND_ORIGIN = "http://localhost:3000";

beforeEach(() => {
  vi.mocked(sendEmail).mockClear();
});

describe("notifyDocumentPending", () => {
  const doc = { id: "doc-1", title: "Q3 Report" };
  const uploader = { name: "Alex Uploader" };
  const admin = { email: "admin@recykal.com", name: "Ada Min" };

  it("emails every admin with the approvals-queue CTA", async () => {
    const admin2 = { email: "admin2@recykal.com", name: "Bea Min" };
    await notifyDocumentPending([admin, admin2], doc, uploader);

    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(2);
    const toAddresses = vi.mocked(sendEmail).mock.calls.map((c) => c[0].to);
    expect(toAddresses).toEqual([admin.email, admin2.email]);

    const call = vi.mocked(sendEmail).mock.calls[0][0];
    expect(call.subject).toBe("Pending approval: Q3 Report");
    expect(call.html).toContain(`href="${FRONTEND_ORIGIN}/dashboard/approvals"`);
    expect(call.html).toContain(">Take me there<");
  });

  it("the body verb changes with `reason`", async () => {
    await notifyDocumentPending([admin], doc, uploader, "upload");
    expect(vi.mocked(sendEmail).mock.calls[0][0].html).toContain("uploaded");

    vi.mocked(sendEmail).mockClear();
    await notifyDocumentPending([admin], doc, uploader, "new_version");
    expect(vi.mocked(sendEmail).mock.calls[0][0].html).toContain("pushed a new version of");

    vi.mocked(sendEmail).mockClear();
    await notifyDocumentPending([admin], doc, uploader, "revert");
    expect(vi.mocked(sendEmail).mock.calls[0][0].html).toContain("reverted");
  });

  it("sends nothing when the admin list is empty", async () => {
    await notifyDocumentPending([], doc, uploader);
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });

  it("escapes HTML in the uploader's name and the document title", async () => {
    await notifyDocumentPending(
      [admin],
      { id: "doc-2", title: '<script>alert("x")</script>' },
      { name: "<b>Evil</b>" },
    );
    const html = vi.mocked(sendEmail).mock.calls[0][0].html;
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<b>Evil</b>");
    expect(html).toContain("&lt;b&gt;Evil&lt;/b&gt;");
  });
});

describe("notifyDocumentApproved", () => {
  it("emails the uploader with a deep link straight to the document", async () => {
    const uploader = { email: "uploader@recykal.com", name: "Uma Uploader" };
    await notifyDocumentApproved(uploader, { id: "doc-42", title: "Roadmap" });

    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1);
    const call = vi.mocked(sendEmail).mock.calls[0][0];
    expect(call.to).toBe(uploader.email);
    expect(call.subject).toBe("Approved: Roadmap");
    expect(call.html).toContain(`href="${FRONTEND_ORIGIN}/dashboard?doc=doc-42"`);
  });
});

describe("notifyDocumentRejected", () => {
  const uploader = { email: "uploader@recykal.com", name: "Uma Uploader" };
  const doc = { id: "doc-7", title: "Draft PRD" };

  it("includes the reviewer note when present", async () => {
    await notifyDocumentRejected(uploader, doc, "please resubmit as PDF");
    const html = vi.mocked(sendEmail).mock.calls[0][0].html;
    expect(html).toContain("Reviewer note: please resubmit as PDF");
  });

  it("omits any reviewer-note line when null", async () => {
    await notifyDocumentRejected(uploader, doc, null);
    const html = vi.mocked(sendEmail).mock.calls[0][0].html;
    expect(html).not.toContain("Reviewer note:");
  });

  it("still deep-links to the document (it isn't deleted, just rejected)", async () => {
    await notifyDocumentRejected(uploader, doc, null);
    expect(vi.mocked(sendEmail).mock.calls[0][0].html).toContain(`href="${FRONTEND_ORIGIN}/dashboard?doc=doc-7"`);
  });
});

describe("notifyDeletionRequested", () => {
  it("emails admins with the approvals-queue CTA, same as a pending upload", async () => {
    const admin = { email: "admin@recykal.com", name: "Ada Min" };
    await notifyDeletionRequested([admin], { id: "doc-9", title: "Old Policy" }, { name: "Riley Requester" });

    const call = vi.mocked(sendEmail).mock.calls[0][0];
    expect(call.subject).toBe("Deletion requested: Old Policy");
    expect(call.html).toContain(`href="${FRONTEND_ORIGIN}/dashboard/approvals"`);
    expect(call.html).toContain("Riley Requester");
  });

  it("sends nothing when the admin list is empty", async () => {
    await notifyDeletionRequested([], { id: "doc-9", title: "Old Policy" }, { name: "Riley Requester" });
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });
});

describe("notifyDeletionApproved", () => {
  it("emails the requester with a Recycle Bin CTA — the doc's own page is gone", async () => {
    const requester = { email: "requester@recykal.com", name: "Riley Requester" };
    await notifyDeletionApproved(requester, { title: "Old Policy" });

    const call = vi.mocked(sendEmail).mock.calls[0][0];
    expect(call.to).toBe(requester.email);
    expect(call.subject).toBe("Deletion approved: Old Policy");
    expect(call.html).toContain(`href="${FRONTEND_ORIGIN}/dashboard/recycle-bin"`);
  });
});

describe("notifyDeletionRejected", () => {
  it("emails the requester with a deep link back to the (still-existing) document", async () => {
    const requester = { email: "requester@recykal.com", name: "Riley Requester" };
    await notifyDeletionRejected(requester, { id: "doc-9", title: "Old Policy" });

    const call = vi.mocked(sendEmail).mock.calls[0][0];
    expect(call.subject).toBe("Deletion rejected: Old Policy");
    expect(call.html).toContain(`href="${FRONTEND_ORIGIN}/dashboard?doc=doc-9"`);
  });
});

describe("notifyMentioned", () => {
  const teamNote = { id: "note-1", title: "Sprint Planning" };
  const mentioner = { name: "Mo Mentioner" };
  const recipient = { email: "mentioned@recykal.com", name: "Mel Mentioned" };

  it("links to just the note when there's no comment id (a content mention)", async () => {
    await notifyMentioned([recipient], mentioner, teamNote);
    const call = vi.mocked(sendEmail).mock.calls[0][0];
    expect(call.subject).toBe("You were mentioned in Sprint Planning");
    expect(call.html).toContain(`href="${FRONTEND_ORIGIN}/dashboard/notes?teamNote=note-1"`);
    expect(call.html).not.toContain("comment=");
  });

  it("links to the note AND the comment when a comment id is given", async () => {
    await notifyMentioned([recipient], mentioner, teamNote, "comment-5");
    const call = vi.mocked(sendEmail).mock.calls[0][0];
    expect(call.html).toContain(`href="${FRONTEND_ORIGIN}/dashboard/notes?teamNote=note-1&comment=comment-5"`);
  });

  it("sends nothing when there are no recipients", async () => {
    await notifyMentioned([], mentioner, teamNote);
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled();
  });
});

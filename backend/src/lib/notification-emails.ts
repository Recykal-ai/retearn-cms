import { sendEmail, buildEmailHtml } from "./email.js";
import { logger } from "./logger.js";

const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

interface Recipient {
  email: string;
  name: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Purple accent for the actor name / document / note title in a body line —
// already-escaped text in, so callers must escapeHtml() first (same
// contract every bodyLine already had).
function highlight(s: string): string {
  return `<strong style="color:#6a398c;">${s}</strong>`;
}

// Fires one Resend call per recipient rather than batching/bcc — simpler to
// reason about, and expected recipient counts (a handful of admins) make N
// calls a non-issue. Never throws — sendEmail already doesn't, but a
// recipient's own failure shouldn't stop the others from going out.
// buildHtml takes the (already-escaped) recipient name rather than a fixed
// html string — the greeting line needs each recipient's own name, so this
// can't share one rendered document across the whole list.
async function sendToAll(recipients: Recipient[], subject: string, buildHtml: (recipientName: string) => string): Promise<void> {
  await Promise.all(
    recipients.map((r) =>
      sendEmail({ to: r.email, subject, html: buildHtml(escapeHtml(r.name)) }).catch((err) =>
        logger.warn("notification email failed", { to: r.email, error: err instanceof Error ? err.message : String(err) }),
      ),
    ),
  );
}

export async function notifyDocumentPending(
  admins: Recipient[],
  doc: { id: string; title: string },
  uploader: { name: string },
  reason: "upload" | "new_version" | "revert" = "upload",
): Promise<void> {
  if (admins.length === 0) return;
  const verb = reason === "upload" ? "uploaded" : reason === "new_version" ? "pushed a new version of" : "reverted";
  const bodyLines = [`${highlight(escapeHtml(uploader.name))} ${verb} ${highlight(escapeHtml(doc.title))}, which is now pending your review.`];
  await sendToAll(admins, `Pending approval: ${doc.title}`, (recipientName) =>
    buildEmailHtml({
      recipientName,
      heading: "A document needs your approval",
      bodyLines,
      ctaLabel: "Take me there",
      ctaUrl: `${FRONTEND_ORIGIN}/dashboard/approvals`,
    }),
  );
}

export async function notifyDocumentApproved(uploader: Recipient, doc: { id: string; title: string }): Promise<void> {
  const html = buildEmailHtml({
    recipientName: escapeHtml(uploader.name),
    heading: "Your document was approved",
    bodyLines: [`${highlight(escapeHtml(doc.title))} has been approved and is now published.`],
    ctaLabel: "Take me there",
    ctaUrl: `${FRONTEND_ORIGIN}/dashboard?doc=${doc.id}`,
  });
  await sendEmail({ to: uploader.email, subject: `Approved: ${doc.title}`, html });
}

export async function notifyDocumentRejected(
  uploader: Recipient,
  doc: { id: string; title: string },
  note: string | null,
): Promise<void> {
  const bodyLines = [`${highlight(escapeHtml(doc.title))} was rejected.`];
  if (note) bodyLines.push(`Reviewer note: ${escapeHtml(note)}`);
  const html = buildEmailHtml({
    recipientName: escapeHtml(uploader.name),
    heading: "Your document was rejected",
    bodyLines,
    ctaLabel: "Take me there",
    ctaUrl: `${FRONTEND_ORIGIN}/dashboard?doc=${doc.id}`,
  });
  await sendEmail({ to: uploader.email, subject: `Rejected: ${doc.title}`, html });
}

export async function notifyDeletionRequested(
  admins: Recipient[],
  doc: { id: string; title: string },
  requester: { name: string },
): Promise<void> {
  if (admins.length === 0) return;
  const bodyLines = [`${highlight(escapeHtml(requester.name))} requested deletion of ${highlight(escapeHtml(doc.title))}.`];
  await sendToAll(admins, `Deletion requested: ${doc.title}`, (recipientName) =>
    buildEmailHtml({
      recipientName,
      heading: "A deletion request needs your review",
      bodyLines,
      ctaLabel: "Take me there",
      ctaUrl: `${FRONTEND_ORIGIN}/dashboard/approvals`,
    }),
  );
}

export async function notifyDeletionApproved(requester: Recipient, doc: { title: string }): Promise<void> {
  const html = buildEmailHtml({
    recipientName: escapeHtml(requester.name),
    heading: "Your deletion request was approved",
    bodyLines: [`${highlight(escapeHtml(doc.title))} has been deleted, as you requested.`],
    ctaLabel: "Take me there",
    ctaUrl: `${FRONTEND_ORIGIN}/dashboard/recycle-bin`,
  });
  await sendEmail({ to: requester.email, subject: `Deletion approved: ${doc.title}`, html });
}

export async function notifyDeletionRejected(requester: Recipient, doc: { id: string; title: string }): Promise<void> {
  const html = buildEmailHtml({
    recipientName: escapeHtml(requester.name),
    heading: "Your deletion request was rejected",
    bodyLines: [`Your request to delete ${highlight(escapeHtml(doc.title))} was not approved. It remains available.`],
    ctaLabel: "Take me there",
    ctaUrl: `${FRONTEND_ORIGIN}/dashboard?doc=${doc.id}`,
  });
  await sendEmail({ to: requester.email, subject: `Deletion rejected: ${doc.title}`, html });
}

export async function notifyMentioned(
  recipients: Recipient[],
  mentionedBy: { name: string },
  teamNote: { id: string; title: string },
  commentId?: string,
): Promise<void> {
  if (recipients.length === 0) return;
  const url = commentId
    ? `${FRONTEND_ORIGIN}/dashboard/notes?teamNote=${teamNote.id}&comment=${commentId}`
    : `${FRONTEND_ORIGIN}/dashboard/notes?teamNote=${teamNote.id}`;
  const bodyLines = [`${highlight(escapeHtml(mentionedBy.name))} mentioned you in ${highlight(escapeHtml(teamNote.title))}.`];
  await sendToAll(recipients, `You were mentioned in ${teamNote.title}`, (recipientName) =>
    buildEmailHtml({
      recipientName,
      heading: "You were mentioned in a team note",
      bodyLines,
      ctaLabel: "Take me to the note",
      ctaUrl: url,
    }),
  );
}

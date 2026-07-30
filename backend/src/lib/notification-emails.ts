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

// Fires one Resend call per recipient rather than batching/bcc — simpler to
// reason about, and expected recipient counts (a handful of admins) make N
// calls a non-issue. Never throws — sendEmail already doesn't, but a
// recipient's own failure shouldn't stop the others from going out.
async function sendToAll(recipients: Recipient[], subject: string, html: string): Promise<void> {
  await Promise.all(
    recipients.map((r) =>
      sendEmail({ to: r.email, subject, html }).catch((err) =>
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
  const html = buildEmailHtml({
    heading: "A document needs your approval",
    bodyLines: [`${escapeHtml(uploader.name)} ${verb} <strong>${escapeHtml(doc.title)}</strong>, which is now pending your review.`],
    ctaLabel: "Take me there",
    ctaUrl: `${FRONTEND_ORIGIN}/dashboard/approvals`,
  });
  await sendToAll(admins, `Pending approval: ${doc.title}`, html);
}

export async function notifyDocumentApproved(uploader: Recipient, doc: { id: string; title: string }): Promise<void> {
  const html = buildEmailHtml({
    heading: "Your document was approved",
    bodyLines: [`<strong>${escapeHtml(doc.title)}</strong> has been approved and is now published.`],
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
  const bodyLines = [`<strong>${escapeHtml(doc.title)}</strong> was rejected.`];
  if (note) bodyLines.push(`Reviewer note: ${escapeHtml(note)}`);
  const html = buildEmailHtml({
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
  const html = buildEmailHtml({
    heading: "A deletion request needs your review",
    bodyLines: [`${escapeHtml(requester.name)} requested deletion of <strong>${escapeHtml(doc.title)}</strong>.`],
    ctaLabel: "Take me there",
    ctaUrl: `${FRONTEND_ORIGIN}/dashboard/approvals`,
  });
  await sendToAll(admins, `Deletion requested: ${doc.title}`, html);
}

export async function notifyDeletionApproved(requester: Recipient, doc: { title: string }): Promise<void> {
  const html = buildEmailHtml({
    heading: "Your deletion request was approved",
    bodyLines: [`<strong>${escapeHtml(doc.title)}</strong> has been deleted, as you requested.`],
    ctaLabel: "Take me there",
    ctaUrl: `${FRONTEND_ORIGIN}/dashboard/recycle-bin`,
  });
  await sendEmail({ to: requester.email, subject: `Deletion approved: ${doc.title}`, html });
}

export async function notifyDeletionRejected(requester: Recipient, doc: { id: string; title: string }): Promise<void> {
  const html = buildEmailHtml({
    heading: "Your deletion request was rejected",
    bodyLines: [`Your request to delete <strong>${escapeHtml(doc.title)}</strong> was not approved. It remains available.`],
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
  const html = buildEmailHtml({
    heading: "You were mentioned in a team note",
    bodyLines: [`${escapeHtml(mentionedBy.name)} mentioned you in <strong>${escapeHtml(teamNote.title)}</strong>.`],
    ctaLabel: "Take me to the note",
    ctaUrl: url,
  });
  await sendToAll(recipients, `You were mentioned in ${teamNote.title}`, html);
}

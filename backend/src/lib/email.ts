import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger.js";

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM ?? SMTP_USER ?? "";

interface SendEmailArgs {
  to: string;
  subject: string;
  html: string;
}

// Sends via Gmail SMTP using a real @recykal.com Google Workspace account
// (an App Password, not the account's real login password — Gmail rejects
// plain-password SMTP auth). No third-party email provider, no domain
// verification needed — this reaches any recipient because it's a real
// mailbox sending real mail, the same as sending from Gmail's own web UI.
// Note: Gmail forces the From header to match (or be a verified alias of)
// SMTP_USER — EMAIL_FROM's display name can differ, but the address itself
// can't point at a different account.
//
// Lazy + cached — constructing the transporter validates nothing over the
// network by itself, so this doesn't fail at import time if env vars are
// still unset; the first real send attempt is where a bad credential shows up.
let transporter: Transporter | null = null;
function getTransporter(): Transporter | null {
  if (!SMTP_USER || !SMTP_PASS) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });
  }
  return transporter;
}

// Never throws — an SMTP outage, a bad app password, or a missing config
// must never fail the request that triggered the notification (an upload,
// approve, mention, etc). Same never-throws contract as
// office-preview.ts's convertOfficeToPdf and note-pdf.ts's renderNoteToPdf.
export async function sendEmail({ to, subject, html }: SendEmailArgs): Promise<void> {
  const t = getTransporter();
  if (!t) {
    logger.warn("email.send skipped: SMTP_USER/SMTP_PASS not set", { to, subject });
    return;
  }
  try {
    await t.sendMail({ from: EMAIL_FROM, to, subject, html });
  } catch (err) {
    logger.warn("email.send failed", { to, subject, error: err instanceof Error ? err.message : String(err) });
  }
}

// Shared branded shell — logo/heading bar, body paragraphs, one CTA button,
// footer. Table-based layout with inline styles throughout (not a <style>
// block) for broad email-client support — Gmail/Outlook strip <style> in
// some contexts, but inline styles always survive. Colors match the app's
// own --brand-purple/--brand-purple-tint (globals.css).
export function buildEmailHtml(opts: { heading: string; bodyLines: string[]; ctaLabel: string; ctaUrl: string }): string {
  const { heading, bodyLines, ctaLabel, ctaUrl } = opts;
  const paragraphs = bodyLines
    .map((line) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.5;color:#333333;">${line}</p>`)
    .join("");
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background-color:#f4eef8;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4eef8;padding:32px 0;">
      <tr><td align="center">
        <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <tr><td style="background-color:#6a398c;padding:24px 32px;">
            <span style="color:#ffffff;font-size:18px;font-weight:bold;">CMS Portal</span>
          </td></tr>
          <tr><td style="padding:32px;">
            <h1 style="margin:0 0 16px;font-size:20px;color:#1a1a1a;">${heading}</h1>
            ${paragraphs}
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:8px;">
              <tr><td style="border-radius:6px;background-color:#6a398c;">
                <a href="${ctaUrl}" style="display:inline-block;padding:12px 24px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:6px;">${ctaLabel}</a>
              </td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:16px 32px;background-color:#f4eef8;">
            <p style="margin:0;font-size:12px;color:#888888;">You're receiving this because you're part of the CMS Portal workflow. This is an automated message.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

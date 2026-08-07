import nodemailer, { type Transporter } from "nodemailer";
import { logger } from "./logger.js";

const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const EMAIL_FROM = process.env.EMAIL_FROM ?? SMTP_USER ?? "";
// Same var notification-emails.ts builds in-app CTA links from — reused here
// for the header banner image, since that also needs to be a real reachable
// URL (frontend/public/email-header-bg.png), not a bundler asset path.
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN ?? "http://localhost:3000";

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

// Shared branded shell — photo header banner, greeting, body paragraphs, one
// pill CTA button, footer below a divider. Table-based layout with inline
// styles throughout (not a <style> block, bar one small progressive-
// enhancement exception below) for broad email-client support — Gmail/
// Outlook strip <style> in some contexts, but inline styles always survive.
// Colors match the app's own --brand-purple/--brand-purple-tint
// (globals.css), sourced from retearn.in itself.
//
// The header banner is a static PNG (frontend/public/email-header-bg.png,
// served over FRONTEND_ORIGIN) reproducing the flowing-line background
// retearn.in/insights animates on mouse movement — email clients strip
// <script> outright and don't reliably run CSS animations either, so an
// actually-interactive background isn't achievable here; a static capture
// of the same look is the standard treatment (every transactional email a
// user gets — GitHub, Linear, Notion — uses a static hero image for exactly
// this reason).
const CARD_WIDTH = 480;
// Source image is 833×295 (frontend/public/email-header-bg.png) — height at
// the card's own width, fixed up front so the banner reserves its space
// immediately instead of the card collapsing to just the text below it and
// then jumping once the banner loads in.
const BANNER_HEIGHT = Math.round((CARD_WIDTH * 295) / 833);

export function buildEmailHtml(opts: {
  recipientName: string;
  heading: string;
  bodyLines: string[];
  ctaLabel: string;
  ctaUrl: string;
}): string {
  const { recipientName, heading, bodyLines, ctaLabel, ctaUrl } = opts;
  const paragraphs = bodyLines
    .map((line) => `<p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;text-align:center;">${line}</p>`)
    .join("");
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <!-- Montserrat for the heading only — body text stays the Arial/Helvetica
         stack for reading comfort at 15px. Gmail web/app (this app's only
         real audience — every recipient is a Google Workspace account) does
         render a linked Google Font; anything that doesn't just falls back
         to the bold Arial already in the h1's own font-family list, so this
         never breaks, only sometimes doesn't upgrade. -->
    <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@700;800&display=swap" rel="stylesheet" />
    <style>
      /* Gmail/Apple Mail webmail honor a <style> block enough for this one
         progressive-enhancement touch; clients that don't (Outlook desktop)
         just keep the button's own inline background-color — never broken,
         only ever slightly less polished. */
      .cta-button:hover { background-color: #522c6d !important; }
    </style>
  </head>
  <body style="margin:0;padding:0;background-color:#ffffff;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#ffffff;padding:40px 0;">
      <tr><td align="center">
        <!-- Square corners throughout, not just rounded on the two the
             banner happens to sit at — a border-radius here only clips the
             card's outer corners, so the banner's top looked soft (it's the
             card's own top-left/top-right corner) while its bottom read
             hard (an internal seam between two rows, never a corner at
             all). Dropping the radius makes every edge consistent instead
             of half-rounding a shape that can't be rounded on all four
             sides in the first place. -->
        <table role="presentation" width="${CARD_WIDTH}" cellpadding="0" cellspacing="0" style="width:${CARD_WIDTH}px;max-width:${CARD_WIDTH}px;background-color:#ffffff;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
          <tr><td>
            <!-- A CSS background-image div, not an <img> — Gmail shows a
                 hover download affordance on any real inline <img> content
                 element, which looked wrong on a purely decorative banner;
                 a background-image is never treated as a savable image.
                 Fixed height (not height:auto off an <img>) also means this
                 reserves its space immediately, so the card never renders
                 collapsed-then-jumps once the banner finishes loading. -->
            <div style="width:100%;height:${BANNER_HEIGHT}px;background-color:#e5e5e5;background-image:url('${FRONTEND_ORIGIN}/email-header-bg.png');background-size:cover;background-position:center;"></div>
          </td></tr>
          <tr><td style="padding:36px 40px 32px;text-align:center;">
            <h1 style="margin:0 0 20px;font-size:24px;line-height:1.3;color:#1a1a1a;font-family:'Montserrat',Arial,Helvetica,sans-serif;font-weight:800;">${heading}</h1>
            <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#333333;">Hi, <strong style="color:#6a398c;">${recipientName}</strong>!</p>
            ${paragraphs}
            <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto 0;">
              <tr><td style="border-radius:999px;background-color:#6a398c;">
                <a href="${ctaUrl}" class="cta-button" style="display:inline-block;padding:13px 32px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:999px;background-color:#6a398c;">${ctaLabel}</a>
              </td></tr>
            </table>
          </td></tr>
          <tr><td style="padding:20px 40px 28px;">
            <hr style="border:none;border-top:1px solid #eeeeee;margin:0 0 16px;" />
            <p style="margin:0;font-size:12px;line-height:1.5;color:#9a9a9a;text-align:center;">You're receiving this because you're part of the CMS Portal workflow.<br />This is an automated message.</p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

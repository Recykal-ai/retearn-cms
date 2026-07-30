import { JSDOM } from "jsdom";
import puppeteer, { type Browser } from "puppeteer";
import { sanitizeNoteHtml } from "./sanitize-html.js";
import { mimeTypeFor } from "./mime-types.js";
import { storage } from "./storage.js";
import { logger } from "./logger.js";

// A real browser engine, not LibreOffice's HTML import filter — that filter
// was tried first and produced badly broken output (table borders dropped
// entirely, <pre> block backgrounds rendered as ragged per-line highlight
// runs instead of one filled rectangle). Chromium renders the exact CSS
// below the same way any browser would, so there's no filter-support gap to
// work around. See office-preview.ts's own comment on why the docx/pptx
// preview path stays on LibreOffice — that's converting real Office
// documents, not arbitrary HTML we wrote ourselves.
//
// Launched once and reused — a fresh launch is ~1-2s of overhead per export,
// not worth paying on every call. Lazy (only launches on first actual
// export) so a dev machine without Chromium fully set up doesn't fail at
// server startup for an otherwise-unrelated request.
let browserPromise: Promise<Browser> | null = null;
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    // --no-sandbox is needed to run Chromium as root inside most container
    // images (Railway/Render) — safe here since the only content ever
    // rendered is HTML we generated ourselves from sanitized note content
    // and our own inlined image bytes, never arbitrary user-supplied pages.
    //
    // headless: "shell" launches chrome-headless-shell instead of full
    // Chrome — a separate binary Puppeteer downloads alongside Chrome
    // specifically for this, with no windowing/GUI code path at all. Plain
    // `headless: true` (the default) launches full Chrome with
    // `--headless=new`, which on this Windows dev machine was still
    // surfacing a real, visible blank window on the browser's first launch
    // (confirmed — `--disable-gpu` didn't stop it, since forcing software
    // rendering was likely *why* Chrome fell back to a real window surface
    // in the first place). The shell binary can't do that; it was never
    // built with a window compositor at all.
    browserPromise = puppeteer.launch({
      headless: "shell",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    // A launch failure (e.g. a transient cold-start filesystem issue)
    // otherwise caches the rejected promise forever — every future export
    // would re-await and re-throw that same rejection instead of retrying,
    // permanently breaking the feature until the process restarts. Clearing
    // it back to null lets the next call attempt a fresh launch.
    browserPromise.catch(() => {
      browserPromise = null;
    });
  }
  return browserPromise;
}

// Structurally faithful to the in-app editor — mirrors the subset of
// globals.css's .ProseMirror rules that matters outside the live editor (no
// selection/hover/handle styling, none of that applies to a static export).
const EXPORT_STYLE = `
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12pt; color: #111827; padding: 24px; }
  h1.note-title { font-size: 20pt; font-weight: 700; margin: 0 0 16px; }
  h1 { font-size: 16pt; font-weight: 700; margin: 0.6em 0 0.3em; }
  h2 { font-size: 14pt; font-weight: 700; margin: 0.6em 0 0.3em; }
  h3 { font-size: 12.5pt; font-weight: 600; margin: 0.5em 0 0.25em; }
  h4, h5, h6 { font-size: 12pt; font-weight: 600; margin: 0.5em 0 0.25em; }
  p { margin: 0.4em 0; }
  ul { list-style: disc; padding-left: 1.5em; margin: 0.4em 0; }
  ol { list-style: decimal; padding-left: 1.5em; margin: 0.4em 0; }
  li { margin: 0.15em 0; }
  li p { margin: 0; }
  blockquote { border-left: 3px solid #d1d5db; padding-left: 0.75em; color: #6b7280; margin: 0.4em 0; }
  strong { font-weight: 700; }
  em { font-style: italic; }
  a { color: #7c3aed; text-decoration: underline; }
  mark { background: #fef08a; border-radius: 0.15em; padding: 0 0.1em; }
  code { background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 0.25em; padding: 0.1em 0.3em; }
  pre { background: #1e1e1e; color: #e5e5e5; border-radius: 0.4em; padding: 0.75em 1em; line-height: 1.6; margin: 0.4em 0; white-space: pre-wrap; }
  pre code { background: none; border: none; padding: 0; color: inherit; }
  span[data-type="mention"] { background: #ede9fe; color: #7c3aed; border-radius: 999px; padding: 0.05em 0.5em; white-space: nowrap; }
  ul[data-type="taskList"] { list-style: none; padding-left: 0; }
  ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 0.5em; }
  ul[data-type="taskList"] li > div { flex: 1; min-width: 0; }
  ul[data-type="taskList"] li > div p { margin: 0; }
  ul[data-type="taskList"] li[data-checked="true"] > div { color: #9ca3af; text-decoration: line-through; }
  table { border-collapse: collapse; margin: 0.6em 0; }
  td, th { vertical-align: top; padding: 0.4em 0.6em; border: 1px solid #d1d5db; }
  th { background: #f9fafb; font-weight: 600; text-align: left; }
  td > p, th > p { margin: 0; }
  img { max-width: 100%; }
`;

// Rewrites every note-image <img> tag to carry its actual bytes as a
// data: URI. Stored note HTML deliberately never carries a real `src` (see
// sanitize-html.ts's comment — a signed URL would expire long before the
// note does), but LibreOffice's headless renderer has no way to resolve one
// even if it were there: it can't authenticate a fetch back to our own API,
// and won't wait on network I/O anyway. Inlining is the only way to hand it
// a self-contained document.
async function inlineNoteImages(html: string): Promise<string> {
  const dom = new JSDOM(html);
  const { document } = dom.window;
  const images = Array.from(document.querySelectorAll('img[data-type="note-image"]'));

  await Promise.all(
    images.map(async (el) => {
      const key = el.getAttribute("data-image-key");
      if (!key) {
        el.remove();
        return;
      }
      try {
        const bytes = await storage.getBytes(key);
        const mime = mimeTypeFor(key);
        el.setAttribute("src", `data:${mime};base64,${bytes.toString("base64")}`);
      } catch (err) {
        logger.warn("note-pdf: failed to inline image, dropping", {
          key,
          error: err instanceof Error ? err.message : String(err),
        });
        el.remove();
      }
    }),
  );

  return document.body.innerHTML;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Renders a note's stored content to a PDF buffer via headless Chromium.
// Never throws — mirrors convertOfficeToPdf's own "return null on failure"
// convention so callers (the export-pdf routes) can respond with a clean
// error instead of a 500 stack trace.
export async function renderNoteToPdf(title: string, contentHtml: string): Promise<Buffer | null> {
  let page: Awaited<ReturnType<Browser["newPage"]>> | null = null;
  try {
    const sanitized = sanitizeNoteHtml(contentHtml);
    const inlined = await inlineNoteImages(sanitized);
    const document = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>${EXPORT_STYLE}</style>
</head>
<body>
<h1 class="note-title">${escapeHtml(title)}</h1>
${inlined}
</body>
</html>`;

    const browser = await getBrowser();
    page = await browser.newPage();
    // "load" is sufficient (not "networkidle0", unsupported by setContent's
    // narrower type) — everything the document references is already
    // inlined as a data: URI above, so there's no real network activity to
    // wait out.
    await page.setContent(document, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "a4",
      printBackground: true,
      margin: { top: "18mm", bottom: "18mm", left: "16mm", right: "16mm" },
    });
    return Buffer.from(pdf);
  } catch (err) {
    logger.warn("note-pdf: render failed", {
      title,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    await page?.close().catch(() => {});
  }
}

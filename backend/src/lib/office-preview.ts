import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { logger } from "./logger.js";

const execFileAsync = promisify(execFile);

// .doc/.ppt (legacy binary Office formats) convert fine through the same
// LibreOffice filter as their OOXML successors — no reason to only cover
// docx/pptx.
const OFFICE_EXTENSIONS = new Set(["doc", "docx", "ppt", "pptx"]);

export function isOfficePreviewCandidate(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return OFFICE_EXTENSIONS.has(ext);
}

// SOFFICE_PATH lets a plain `soffice` (once it's on PATH after e.g. `apt
// install libreoffice` in production) be overridden for a dev machine where
// it's installed but not on PATH — see backend/.env.
const SOFFICE_BIN = process.env.SOFFICE_PATH || "soffice";

// Converts an uploaded docx/pptx (or legacy doc/ppt) to PDF via a headless
// LibreOffice subprocess — the only way to close the "Open with Google
// Docs/Slides" escape hatch the previous approach (routing these through
// Google's own read-only viewer) had: that button appears for any signed-in
// Google visitor and lets them download or edit the file, which defeats
// view-only enforcement entirely. Once converted, the PDF renders through
// our own pdf.js viewer exactly like a native PDF upload — no external site
// involved, nothing to click "open with."
//
// Each call gets its own isolated LibreOffice user-profile directory
// (-env:UserInstallation) — sharing the default profile across concurrent
// conversions is a known way to get silent failures/hangs, since LibreOffice
// treats a second process pointed at an in-use profile as a conflicting
// instance. Returns null (never throws) on any failure — soffice missing,
// a corrupt file, a conversion timeout — so callers can fall back rather
// than blocking the whole upload on a converter issue.
//
// Note: note-pdf.ts's HTML-to-PDF export deliberately does NOT use this
// pipeline — LibreOffice's HTML import filter has very weak CSS support
// (table borders and multi-line <pre> backgrounds render badly), so that
// path renders through headless Chromium (Puppeteer) instead, a real
// browser engine. This one stays LibreOffice-only because it's converting
// actual Office document formats, not arbitrary CSS-styled HTML.
export async function convertOfficeToPdf(buffer: Buffer, filename: string): Promise<Buffer | null> {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "bin";
  const workDir = await mkdtemp(path.join(tmpdir(), "office-preview-"));
  const profileDir = await mkdtemp(path.join(tmpdir(), "office-profile-"));
  try {
    const inputPath = path.join(workDir, `input.${ext}`);
    await writeFile(inputPath, buffer);

    await execFileAsync(
      SOFFICE_BIN,
      [
        "--headless",
        "--norestore",
        `-env:UserInstallation=file:///${profileDir.replace(/\\/g, "/")}`,
        "--convert-to",
        "pdf",
        "--outdir",
        workDir,
        inputPath,
      ],
      { timeout: 60_000 },
    );

    return await readFile(path.join(workDir, "input.pdf"));
  } catch (err) {
    logger.warn("office-to-pdf conversion failed — falling back", {
      filename,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
    await rm(profileDir, { recursive: true, force: true }).catch(() => {});
  }
}

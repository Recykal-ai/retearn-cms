export type FileTypeKey = "word" | "excel" | "powerpoint" | "pdf" | "image" | "link" | "other";

const EXTENSION_MAP: Record<string, FileTypeKey> = {
  doc: "word",
  docx: "word",
  xls: "excel",
  xlsx: "excel",
  csv: "excel",
  ppt: "powerpoint",
  pptx: "powerpoint",
  pdf: "pdf",
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
};

// Labeled after the Google glyphs FileTypeIcon renders for these types (see
// its BRAND_ICON_SRC), not the underlying MS Office extensions — a "word"
// row shows the Docs icon, so its filter-chip label reads "Docs" too rather
// than naming a different brand than what's on screen.
export const FILE_TYPE_LABEL: Record<FileTypeKey, string> = {
  word: "Docs",
  excel: "Sheets",
  powerpoint: "Slides",
  pdf: "PDF",
  image: "Image",
  link: "Link",
  other: "Other",
};

export function fileTypeOf(title: string, sourceType: "FILE" | "LINK"): FileTypeKey {
  if (sourceType === "LINK") return "link";
  const ext = title.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MAP[ext] ?? "other";
}

export type LinkKind = "docs" | "sheets" | "slides" | "drive" | "confluence";

// Which brand icon a LINK doc's stored URL should show, so the grid/list
// views can render the actual Docs/Sheets/Slides/Confluence glyph instead
// of a plain chain-link icon for every link — same view-only-in-Drive links
// this app already special-cases for viewing (see backend's
// getDriveExportTarget). Confluence has no equivalent special-case (there's
// no way to enforce view-only or convert it server-side — see the project
// notes on why that stays out of scope), this is purely cosmetic icon
// selection. null means "not a recognized URL," which falls back to the
// generic link icon.
export function linkKindOf(externalUrl: string | null | undefined): LinkKind | null {
  if (!externalUrl) return null;
  let host: string;
  let path: string;
  try {
    const u = new URL(externalUrl);
    host = u.hostname;
    path = u.pathname;
  } catch {
    return null;
  }
  if (/(^|\.)google\.com$/.test(host)) {
    if (path.startsWith("/document/")) return "docs";
    if (path.startsWith("/spreadsheets/")) return "sheets";
    if (path.startsWith("/presentation/")) return "slides";
    if (host === "drive.google.com") return "drive";
    return null;
  }
  // e.g. https://{site}.atlassian.net/wiki/spaces/{SPACE}/pages/{id}/{title}
  if (/\.atlassian\.net$/.test(host) && path.startsWith("/wiki/")) return "confluence";
  return null;
}

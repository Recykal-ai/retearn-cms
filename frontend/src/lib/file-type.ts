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
// its GOOGLE_ICON_SRC), not the underlying MS Office extensions — a "word"
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

export type GoogleLinkKind = "docs" | "sheets" | "slides" | "drive";

// Which Google icon a LINK doc's stored URL should show, so the grid/list
// views can render the actual Docs/Sheets/Slides glyph instead of a plain
// chain-link icon for every link — same view-only-in-Drive links this app
// already special-cases for viewing (see backend's getDriveExportTarget).
// null means "not a recognized Drive URL," which falls back to the generic
// link icon.
export function googleLinkKindOf(externalUrl: string | null | undefined): GoogleLinkKind | null {
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
  if (!/(^|\.)google\.com$/.test(host)) return null;
  if (path.startsWith("/document/")) return "docs";
  if (path.startsWith("/spreadsheets/")) return "sheets";
  if (path.startsWith("/presentation/")) return "slides";
  if (host === "drive.google.com") return "drive";
  return null;
}

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

export const FILE_TYPE_LABEL: Record<FileTypeKey, string> = {
  word: "Word",
  excel: "Excel",
  powerpoint: "PowerPoint",
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

import type { FileTypeKey } from "@/lib/file-type";

const STYLE: Record<FileTypeKey, { bg: string; label: string }> = {
  word: { bg: "#2b579a", label: "W" },
  excel: { bg: "#217346", label: "X" },
  powerpoint: { bg: "#d24726", label: "P" },
  pdf: { bg: "#b3342c", label: "PDF" },
  image: { bg: "#8a5cf6", label: "IMG" },
  link: { bg: "#6b7280", label: "" },
  other: { bg: "#9ca3af", label: "" },
};

export function FileTypeIcon({ type }: { type: FileTypeKey }) {
  const style = STYLE[type];

  // Kept as hand-drawn SVGs, not the icon pack — at the small size these
  // render (~20px, often smaller in dense lists) the pack's outline glyphs
  // for "link" and "generic file" read as an indistinct squiggle next to the
  // crisp colored W/X/PDF badges; these rounded chain-loop/dog-eared-page
  // shapes stay legible at that size and next to those badges.
  if (type === "link") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "#6b7280" }}>
        <path
          d="M9.5 14.5 14.5 9.5M11 7l1.5-1.5a3.5 3.5 0 0 1 5 5L16 12M13 17l-1.5 1.5a3.5 3.5 0 0 1-5-5L8 12"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  if (type === "other") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "#9ca3af" }}>
        <path
          d="M7 3.5h7.5L18 7v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M14 3.5V7h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      </svg>
    );
  }

  return (
    <div
      className="flex h-5 w-5 items-center justify-center rounded-sm text-[8px] font-bold text-white"
      style={{ background: style.bg }}
    >
      {style.label}
    </div>
  );
}

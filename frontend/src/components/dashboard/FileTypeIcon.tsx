import type { FileTypeKey } from "@/lib/file-type";
import { googleLinkKindOf } from "@/lib/file-type";

// Google's own file-type glyphs (Drive/Docs/Sheets/Slides/PDF/Image),
// shipped as flat full-color PNGs in public/google-icons — not run through
// the currentColor-tintable icon pack (components/dashboard/Icon.tsx), since
// these are brand logos, not single-color glyphs.
const GOOGLE_ICON_SRC: Record<"docs" | "sheets" | "slides" | "pdf" | "image" | "drive", string> = {
  docs: "/google-icons/docs.png",
  sheets: "/google-icons/sheets.png",
  slides: "/google-icons/slides.png",
  pdf: "/google-icons/pdf.png",
  image: "/google-icons/image.png",
  drive: "/google-icons/drive.png",
};

// Word/Excel/PowerPoint files render with Google's Docs/Sheets/Slides
// glyphs rather than Microsoft Office ones — this is a Drive-flavored CMS
// (documents can themselves be Drive links), so the two file "families" read
// as one consistent icon language instead of two competing brand sets.
const FILE_TYPE_ICON: Partial<Record<FileTypeKey, keyof typeof GOOGLE_ICON_SRC>> = {
  word: "docs",
  excel: "sheets",
  powerpoint: "slides",
  pdf: "pdf",
  image: "image",
};

function GoogleIcon({ kind, className }: { kind: keyof typeof GOOGLE_ICON_SRC; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element -- fixed-size static asset, not worth next/image's overhead here
  return <img src={GOOGLE_ICON_SRC[kind]} alt="" width={20} height={20} className={className} draggable={false} />;
}

// Small badge pinned to the icon's corner marking "this is a link, not a
// stored file" — kept even when the icon itself already identifies the
// Google app, since e.g. a Docs *file* upload and a Docs *link* both show
// the same docs.png glyph and need a way to tell them apart at a glance.
function LinkBadge() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className="absolute -right-1 -bottom-1 rounded-full bg-white text-neutral-500"
      style={{ boxShadow: "0 0 0 1px white" }}
    >
      <path
        d="M9.5 14.5 14.5 9.5M11 7l1.5-1.5a3.5 3.5 0 0 1 5 5L16 12M13 17l-1.5 1.5a3.5 3.5 0 0 1-5-5L8 12"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FileTypeIcon({ type, externalUrl }: { type: FileTypeKey; externalUrl?: string | null }) {
  const googleFileIcon = FILE_TYPE_ICON[type];
  if (googleFileIcon) {
    return <GoogleIcon kind={googleFileIcon} />;
  }

  if (type === "link") {
    // GoogleLinkKind's members ("docs"/"sheets"/"slides"/"drive") are
    // themselves valid GOOGLE_ICON_SRC keys, so no separate mapping needed.
    const linkKind = googleLinkKindOf(externalUrl);
    if (linkKind) {
      return (
        <span className="relative inline-flex h-5 w-5">
          <GoogleIcon kind={linkKind} />
          <LinkBadge />
        </span>
      );
    }
    // Kept as a hand-drawn SVG, not the icon pack — at the small size this
    // renders (~20px, often smaller in dense lists) the pack's outline
    // glyph reads as an indistinct squiggle; this chain-loop shape stays
    // legible at that size and next to the Google glyphs above.
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

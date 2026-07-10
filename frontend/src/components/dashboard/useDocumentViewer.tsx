"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fileTypeOf } from "@/lib/file-type";
import { getViewUrlAction, getVersionViewUrlAction } from "@/app/dashboard/documents-actions";
import { DocumentViewerModal, type ViewerKind } from "@/components/dashboard/DocumentViewerModal";
import { openGoogleViewer } from "@/lib/google-viewer";
import { useToast } from "@/components/ToastProvider";

type FreshUrlFetcher = () => Promise<{ url: string; sourceType: "FILE" | "LINK" }>;

// Anything renderable as plain text — markup/config/code files mostly. Not
// tied to FileTypeIcon's FileTypeKey (that's about which icon to draw;
// this is specifically "can we show it as text"). csv/tsv are handled by the
// spreadsheet viewer instead — a parsed table reads much better than raw
// comma-separated text.
const TEXT_EXTENSIONS = new Set([
  "txt", "md", "markdown", "log", "json", "xml", "yaml", "yml",
  "js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "rb", "php", "java", "kt", "swift",
  "c", "h", "cpp", "hpp", "cc", "cs", "go", "rs",
  "html", "htm", "css", "scss", "sass", "less",
  "sh", "bash", "zsh", "sql", "ini", "toml", "cfg", "conf", "env", "properties",
  "vue", "svelte", "gitignore", "dockerfile", "makefile",
]);

const SPREADSHEET_EXTENSIONS = new Set(["xlsx", "xls", "xlsm", "xlsb", "ods", "csv", "tsv"]);

// Only the modern OOXML format — legacy pre-2007 binary .doc still falls
// through to "unsupported" below (both go straight to Google Viewer
// regardless, see openResult, so this distinction is mostly for clarity).
const DOCX_EXTENSIONS = new Set(["docx"]);

function kindFor(filename: string): ViewerKind {
  const type = fileTypeOf(filename, "FILE");
  if (type === "pdf" || type === "image") return type;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (SPREADSHEET_EXTENSIONS.has(ext)) return "spreadsheet";
  if (DOCX_EXTENSIONS.has(ext)) return "docx";
  return TEXT_EXTENSIONS.has(ext) ? "text" : "unsupported";
}

// The "open a shared link" landing state — docx/unsupported can't reliably
// auto-open a new tab here the way a real row click can: AutoOpenDocument
// triggers this from a useEffect on page load, not a click, so there's no
// user gesture backing window.open() and browsers silently block it. Worse,
// once blocked, the ?doc= param gets stripped and there's nothing left on
// screen to show what the link even pointed at. Showing this landing card
// instead — with an explicit, click-triggered "Open" button — fixes both:
// the title is visible immediately, and the click itself is a real gesture
// so the popup opens reliably.
function ExternalOpenPrompt({
  title,
  getFreshUrl,
  onClose,
}: {
  title: string;
  getFreshUrl: FreshUrlFetcher;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const { show } = useToast();

  function handleClick() {
    setLoading(true);
    openGoogleViewer(getFreshUrl, () => show("Couldn't open Google Viewer — try again.", "error")).finally(() => {
      setLoading(false);
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
      style={{ fontFamily: "var(--font-ui)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-xl">
        <p className="mb-1 truncate text-sm font-semibold text-neutral-900">{title}</p>
        <p className="mb-5 text-xs text-neutral-500">Shared from Retearn CMS — click below to view this document.</p>
        <button
          type="button"
          onClick={handleClick}
          disabled={loading}
          className="w-full rounded-lg px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: "var(--brand-purple)" }}
        >
          {loading ? "Opening…" : "Open document ↗"}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 text-xs font-medium text-neutral-400 hover:text-neutral-600"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// Shared by every "open a document" click site (row, card, search, recents,
// approvals, version history): fetches the signed view-url, then either shows
// our own in-browser viewer (pdf/image/text/spreadsheet — the kinds that
// render well natively) or goes straight to Google's read-only viewer for
// docx/unsupported, skipping our modal entirely — one click, no in-app
// render step first. That direct-open only fires for a genuine in-app click
// though (viaLink false/omitted) — when opened via a shared "?doc=" link
// (viaLink: true, see AutoOpenDocument), there's no click backing the
// window.open() call, so it shows ExternalOpenPrompt instead: a landing card
// naming the document with its own real "Open" button. A LINK doc is the one
// other exception: that's an externally-hosted doc (e.g. Google Drive), not
// a file we host, so it opens the external URL directly regardless.
export function useDocumentViewer() {
  const [openingId, setOpeningId] = useState<string | null>(null);
  // getFreshUrl re-runs the same server action that produced `url` — our
  // signed URLs are short-lived (5 min), so by the time someone clicks
  // "Open with Google Viewer" the one fetched when the modal opened may
  // already be too stale for Google's own fetch+convert round trip to land
  // inside its window. Refetching at click time keeps that link reliable.
  const [viewing, setViewing] = useState<{
    title: string;
    url: string;
    kind: ViewerKind;
    getFreshUrl: FreshUrlFetcher;
  } | null>(null);
  const [pendingExternalOpen, setPendingExternalOpen] = useState<{
    title: string;
    getFreshUrl: FreshUrlFetcher;
  } | null>(null);
  const { show } = useToast();
  const router = useRouter();

  function openResult(
    title: string,
    result: { url: string; sourceType: "FILE" | "LINK" },
    getFreshUrl: FreshUrlFetcher,
    viaLink: boolean,
  ) {
    if (result.sourceType === "LINK") {
      window.open(result.url, "_blank", "noopener,noreferrer");
      return;
    }
    const kind = kindFor(title);
    if (kind === "docx" || kind === "unsupported") {
      if (viaLink) {
        setPendingExternalOpen({ title, getFreshUrl });
      } else {
        openGoogleViewer(getFreshUrl, () => show("Couldn't open Google Viewer — try again.", "error"));
      }
      return;
    }
    setViewing({ title, url: result.url, kind, getFreshUrl });
  }

  // A doc can vanish out from under a stale, already-rendered row (someone
  // else deleted it, or a pending upload got rejected) — without this, the
  // fetch below throws uncaught, which crashes to Next.js's error page and
  // leaves the stale row on screen since nothing ever re-fetches the list.
  function handleOpenError() {
    show("This document is no longer available — it may have been removed.", "error");
    router.refresh();
  }

  async function view(doc: { id: string; title: string }, opts?: { viaLink?: boolean }) {
    setOpeningId(doc.id);
    try {
      const result = await getViewUrlAction(doc.id);
      openResult(doc.title, result, () => getViewUrlAction(doc.id), opts?.viaLink ?? false);
    } catch {
      handleOpenError();
    } finally {
      setOpeningId(null);
    }
  }

  async function viewVersion(documentId: string, version: number, filenameHint: string) {
    const key = `${documentId}:${version}`;
    setOpeningId(key);
    try {
      const result = await getVersionViewUrlAction(documentId, version);
      openResult(filenameHint, result, () => getVersionViewUrlAction(documentId, version), false);
    } catch {
      handleOpenError();
    } finally {
      setOpeningId(null);
    }
  }

  const viewerNode = viewing ? (
    <DocumentViewerModal
      title={viewing.title}
      url={viewing.url}
      kind={viewing.kind}
      getFreshUrl={viewing.getFreshUrl}
      onClose={() => setViewing(null)}
    />
  ) : pendingExternalOpen ? (
    <ExternalOpenPrompt
      title={pendingExternalOpen.title}
      getFreshUrl={pendingExternalOpen.getFreshUrl}
      onClose={() => setPendingExternalOpen(null)}
    />
  ) : null;

  return { view, viewVersion, isOpening: (id: string) => openingId === id, viewerNode };
}

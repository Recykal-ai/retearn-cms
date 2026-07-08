"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { fileTypeOf } from "@/lib/file-type";
import { getViewUrlAction, getVersionViewUrlAction } from "@/app/dashboard/documents-actions";
import { DocumentViewerModal, type ViewerKind } from "@/components/dashboard/DocumentViewerModal";
import { useToast } from "@/components/ToastProvider";

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

// Only the modern OOXML format — mammoth (our docx→HTML converter) doesn't
// read the legacy pre-2007 binary .doc format, so that still falls through
// to "unsupported" below.
const DOCX_EXTENSIONS = new Set(["docx"]);

function kindFor(filename: string): ViewerKind {
  const type = fileTypeOf(filename, "FILE");
  if (type === "pdf" || type === "image") return type;
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (SPREADSHEET_EXTENSIONS.has(ext)) return "spreadsheet";
  if (DOCX_EXTENSIONS.has(ext)) return "docx";
  return TEXT_EXTENSIONS.has(ext) ? "text" : "unsupported";
}

// Shared by every "open a document" click site (row, card, search, recents,
// approvals, version history): fetches the signed view-url, then always shows
// our own in-browser viewer for a FILE doc — PDF/image/text render properly,
// anything else shows an explicit "preview not available" message rather
// than letting the browser download it. A LINK doc is the one exception:
// that's an externally-hosted doc (e.g. Google Drive), not a file we host,
// so it still opens the external URL directly — Drive enforces its own access.
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
    getFreshUrl: () => Promise<{ url: string; sourceType: "FILE" | "LINK" }>;
  } | null>(null);
  const { show } = useToast();
  const router = useRouter();

  function openResult(
    title: string,
    result: { url: string; sourceType: "FILE" | "LINK" },
    getFreshUrl: () => Promise<{ url: string; sourceType: "FILE" | "LINK" }>,
  ) {
    if (result.sourceType === "LINK") {
      window.open(result.url, "_blank", "noopener,noreferrer");
      return;
    }
    setViewing({ title, url: result.url, kind: kindFor(title), getFreshUrl });
  }

  // A doc can vanish out from under a stale, already-rendered row (someone
  // else deleted it, or a pending upload got rejected) — without this, the
  // fetch below throws uncaught, which crashes to Next.js's error page and
  // leaves the stale row on screen since nothing ever re-fetches the list.
  function handleOpenError() {
    show("This document is no longer available — it may have been removed.", "error");
    router.refresh();
  }

  async function view(doc: { id: string; title: string }) {
    setOpeningId(doc.id);
    try {
      const result = await getViewUrlAction(doc.id);
      openResult(doc.title, result, () => getViewUrlAction(doc.id));
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
      openResult(filenameHint, result, () => getVersionViewUrlAction(documentId, version));
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
  ) : null;

  return { view, viewVersion, isOpening: (id: string) => openingId === id, viewerNode };
}

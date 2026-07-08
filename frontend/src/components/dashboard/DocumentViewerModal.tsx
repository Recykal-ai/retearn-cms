"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useToast } from "@/components/ToastProvider";

export type ViewerKind = "pdf" | "image" | "text" | "spreadsheet" | "docx" | "unsupported";

// A comfortable single-page reading width, independent of how wide the modal
// itself is — otherwise a page fit to the full modal width on a large
// monitor renders noticeably larger than a typical document viewer.
const MAX_PAGE_WIDTH = 760;

// Google's own viewer (docs.google.com/viewer) fetches an arbitrary URL and
// renders it read-only — no file ever gets imported into anyone's Drive (that
// would be the real "Open with Google Docs/Sheets/Slides" edit-import flow,
// which we deliberately don't offer: it would let the doc be downloaded/edited
// straight out of the opener's own Drive, and scatter copies outside our
// single system of record). This is just a rendering fallback, same signed
// URL we already use, opened read-only in a new tab.
function googleViewerUrl(fileUrl: string) {
  return `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}&embedded=true`;
}

type FreshUrlFetcher = () => Promise<{ url: string; sourceType: "FILE" | "LINK" }>;

// Opens the tab synchronously (as a direct result of the click, so browsers
// don't treat it as a blocked popup) and only navigates it once a fresh
// signed URL comes back — refetching here rather than reusing the URL the
// viewer opened with, since that one may already be minutes old by the time
// someone clicks this, and Google's own fetch+convert needs the rest of that
// window to land.
function OpenWithGoogleButton({
  getFreshUrl,
  variant,
}: {
  getFreshUrl: FreshUrlFetcher;
  variant: "compact" | "large";
}) {
  const [loading, setLoading] = useState(false);
  const { show } = useToast();

  function handleClick() {
    // No noopener/noreferrer flag here — those make window.open() return
    // null by spec, which would silently strand this tab on about:blank
    // forever since we'd have no reference to navigate. Manually clearing
    // .opener below gets the same protection without losing the reference.
    const tab = window.open("", "_blank");
    if (tab) tab.opener = null;
    setLoading(true);
    getFreshUrl()
      .then((fresh) => {
        if (tab) tab.location.href = googleViewerUrl(fresh.url);
      })
      .catch(() => {
        tab?.close();
        show("Couldn't open Google Viewer — try again.", "error");
      })
      .finally(() => setLoading(false));
  }

  if (variant === "large") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={loading}
        className="mt-1 rounded-lg px-6 py-3 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ background: "var(--brand-purple)" }}
      >
        {loading ? "Opening…" : "Open with Google Viewer ↗"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="shrink-0 text-xs font-medium text-white/70 hover:text-white disabled:opacity-60"
    >
      {loading ? "Opening…" : "Open with Google Viewer ↗"}
    </button>
  );
}

// Renders PDFs onto our own <canvas> via pdf.js instead of embedding the
// browser's native PDF viewer (iframe + #toolbar=0 is unreliable — modern
// Chrome largely ignores that fragment and shows its own download button
// anyway). This way there's no native viewer chrome at all, closer to how
// Google Drive's preview behaves. Every FILE document opens this modal now —
// nothing falls back to window.open on the raw signed URL anymore (that's
// how a .md file used to get silently downloaded instead of previewed).
// Text/code files render as plain text; anything we genuinely can't render
// natively (legacy binary .doc, pptx, other binary/unknown types) still gets
// a real preview via the "Open with Google Viewer" fallback in the header.
export function DocumentViewerModal({
  title,
  url,
  kind,
  getFreshUrl,
  onClose,
}: {
  title: string;
  url: string;
  kind: ViewerKind;
  getFreshUrl: FreshUrlFetcher;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/80"
      style={{ fontFamily: "var(--font-ui)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex shrink-0 items-center justify-between gap-4 px-5 py-3">
        <p className="truncate pr-4 text-sm font-medium text-white">{title}</p>
        <div className="flex shrink-0 items-center gap-4">
          <OpenWithGoogleButton getFreshUrl={getFreshUrl} variant="compact" />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-2xl leading-none text-white/80 hover:text-white"
          >
            ×
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 px-4 pb-4">
        {kind === "pdf" && <PdfViewer url={url} />}
        {kind === "image" && <ImageViewer url={url} title={title} />}
        {kind === "text" && <TextViewer url={url} />}
        {kind === "spreadsheet" && <SpreadsheetViewer url={url} />}
        {kind === "docx" && <DocxViewer url={url} />}
        {kind === "unsupported" && <UnsupportedViewer title={title} getFreshUrl={getFreshUrl} />}
      </div>
    </div>
  );
}

function TextViewer({ url }: { url: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState("");
  const MAX_CHARS = 500_000;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const text = await res.text();
        if (cancelled) return;
        if (text.length > MAX_CHARS) {
          setContent(text.slice(0, MAX_CHARS));
          setTruncated(true);
        } else {
          setContent(text);
        }
      } catch {
        if (!cancelled) setError("Couldn't load this file.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return <p className="flex h-full items-center justify-center text-sm text-white/80">{error}</p>;
  }
  if (content === null) {
    return <p className="flex h-full items-center justify-center text-sm text-white/70">Loading preview…</p>;
  }

  return (
    <div
      className="h-full overflow-auto rounded bg-white p-4"
      onContextMenu={(e) => e.preventDefault()}
      style={{ userSelect: "text" }}
    >
      <pre className="font-mono text-xs whitespace-pre-wrap break-words text-neutral-800">{content}</pre>
      {truncated && (
        <p className="mt-3 text-xs text-neutral-400 italic">File truncated for preview — showing the first portion only.</p>
      )}
    </div>
  );
}

interface SheetData {
  name: string;
  rows: string[][];
}

const MAX_SPREADSHEET_ROWS = 500;
const MAX_SPREADSHEET_COLS = 100;

// Parses the workbook client-side via SheetJS (installed from SheetJS's own
// CDN — the npm-registry release has known high-severity CVEs SheetJS never
// backported there) and renders each sheet as a plain HTML table. Covers
// .xlsx/.xls/.xlsm/.ods and, since it reads just as naturally, .csv/.tsv too
// (a parsed table is far more readable than raw comma-separated text).
function SpreadsheetViewer({ url }: { url: string }) {
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const XLSX = await import("xlsx");
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const buffer = await res.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: "array" });
        if (cancelled) return;
        const parsed = workbook.SheetNames.map((name) => {
          const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
            header: 1,
            blankrows: false,
          });
          return {
            name,
            rows: rows
              .slice(0, MAX_SPREADSHEET_ROWS)
              .map((row) => row.slice(0, MAX_SPREADSHEET_COLS).map((cell) => (cell == null ? "" : String(cell)))),
          };
        });
        setSheets(parsed);
      } catch {
        if (!cancelled) setError("Couldn't load this spreadsheet.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return <p className="flex h-full items-center justify-center text-sm text-white/80">{error}</p>;
  }
  if (sheets === null) {
    return <p className="flex h-full items-center justify-center text-sm text-white/70">Loading preview…</p>;
  }
  if (sheets.length === 0) {
    return <p className="flex h-full items-center justify-center text-sm text-white/80">This file has no sheets.</p>;
  }

  const sheet = sheets[activeSheet];
  const truncatedRows = sheet.rows.length >= MAX_SPREADSHEET_ROWS;

  return (
    <div className="flex h-full flex-col" onContextMenu={(e) => e.preventDefault()}>
      {sheets.length > 1 && (
        <div className="mb-2 flex shrink-0 flex-wrap gap-1">
          {sheets.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => setActiveSheet(i)}
              className="rounded-md px-3 py-1 text-xs font-medium"
              style={
                i === activeSheet
                  ? { background: "white", color: "#171717" }
                  : { background: "rgba(255,255,255,0.15)", color: "white" }
              }
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {sheet.rows.length === 0 ? (
        <p className="flex flex-1 items-center justify-center text-sm text-white/80">This sheet is empty.</p>
      ) : (
        <div className="min-h-0 flex-1 overflow-auto rounded bg-white" style={{ userSelect: "text" }}>
          <table className="border-collapse text-xs">
            <tbody>
              {sheet.rows.map((row, ri) => (
                <tr key={ri} className={ri === 0 ? "bg-neutral-100 font-semibold" : ""}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="border border-neutral-200 px-2 py-1 whitespace-nowrap text-neutral-800">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {truncatedRows && (
        <p className="mt-2 shrink-0 text-xs text-white/50 italic">
          Showing the first {MAX_SPREADSHEET_ROWS} rows.
        </p>
      )}
    </div>
  );
}

// Converts the .docx's own XML into HTML client-side via mammoth, then
// sanitizes that HTML with DOMPurify before it ever touches
// dangerouslySetInnerHTML — mammoth only emits a constrained, semantic tag
// vocabulary (p/h1-6/strong/em/table/img data-uris, etc.), but the input is
// an arbitrary user-uploaded file, so it still gets treated as untrusted.
function DocxViewer({ url }: { url: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mammoth, DOMPurify] = await Promise.all([import("mammoth"), import("dompurify")]);
        const res = await fetch(url);
        if (!res.ok) throw new Error();
        const arrayBuffer = await res.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer });
        if (cancelled) return;
        setHtml(DOMPurify.default.sanitize(result.value));
      } catch {
        if (!cancelled) setError("Couldn't load this document.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  if (error) {
    return <p className="flex h-full items-center justify-center text-sm text-white/80">{error}</p>;
  }
  if (html === null) {
    return <p className="flex h-full items-center justify-center text-sm text-white/70">Loading preview…</p>;
  }

  return (
    <div
      className="h-full overflow-auto rounded bg-white p-6"
      onContextMenu={(e) => e.preventDefault()}
      style={{ userSelect: "text" }}
    >
      <div
        className="docx-preview mx-auto max-w-3xl text-sm leading-relaxed text-neutral-800 [&_h1]:mb-3 [&_h1]:text-xl [&_h1]:font-bold [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_p]:mb-3 [&_table]:mb-3 [&_table]:border-collapse [&_td]:border [&_td]:border-neutral-200 [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-neutral-200 [&_th]:px-2 [&_th]:py-1 [&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_img]:max-w-full"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}

function UnsupportedViewer({ title, getFreshUrl }: { title: string; getFreshUrl: FreshUrlFetcher }) {
  const ext = title.includes(".") ? title.split(".").pop()?.toLowerCase() : null;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
      <p className="text-sm font-medium text-white/80">No built-in preview for this file yet</p>
      <p className="max-w-xs text-xs text-white/50">
        {ext ? `".${ext}" files` : "This file type"} can&apos;t be rendered in our own viewer, but Google&apos;s viewer can still show it read-only.
      </p>
      <OpenWithGoogleButton getFreshUrl={getFreshUrl} variant="large" />
    </div>
  );
}

function ImageViewer({ url, title }: { url: string; title: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center" onContextMenu={(e) => e.preventDefault()}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={title}
        draggable={false}
        className="max-h-full max-w-full object-contain"
        style={{ userSelect: "none" }}
      />
    </div>
  );
}

// Renders every page up front into its own <canvas>, stacked vertically in one
// scrollable container — continuous scroll, like Docs/Drive, rather than one
// page swapped at a time. Arrow keys jump a page at a time (scrollIntoView);
// the page counter tracks whichever page is most visible via IntersectionObserver.
function PdfViewer({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageElRef = useRef<(HTMLDivElement | null)[]>([]);
  const pdfRef = useRef<PDFDocumentProxy | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjsLib = await import("pdfjs-dist");
        pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const pdf = await pdfjsLib.getDocument({ url }).promise;
        if (cancelled) return;
        pdfRef.current = pdf;
        setNumPages(pdf.numPages);
        setCurrentPage(1);
        setLoading(false);
      } catch {
        if (!cancelled) {
          setError("Couldn't load this PDF.");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  // Render every page's canvas once the page list exists in the DOM.
  useEffect(() => {
    const pdf = pdfRef.current;
    if (!pdf || numPages === 0) return;
    let cancelled = false;

    (async () => {
      for (let n = 1; n <= numPages; n++) {
        if (cancelled) return;
        const canvas = pageElRef.current[n - 1]?.querySelector("canvas");
        if (!canvas) continue;
        const pageProxy = await pdf.getPage(n);
        if (cancelled) return;
        const containerWidth = containerRef.current?.clientWidth ?? 800;
        // Capped well under the modal's full width — on a wide monitor the
        // modal is close to full-viewport width, and fitting the page to all
        // of that renders it far larger than a comfortable reading size.
        const targetWidth = Math.min(containerWidth - 48, MAX_PAGE_WIDTH);
        const baseViewport = pageProxy.getViewport({ scale: 1 });
        const scale = Math.min(targetWidth / baseViewport.width, 2);
        const viewport = pageProxy.getViewport({ scale: Math.max(scale, 0.25) });
        const context = canvas.getContext("2d");
        if (!context) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await pageProxy.render({ canvas, canvasContext: context, viewport }).promise;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [numPages]);

  // Tracks which page is most in-view so the counter stays accurate while scrolling.
  useEffect(() => {
    const root = containerRef.current;
    if (!root || numPages === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        let best: { page: number; ratio: number } | null = null;
        for (const entry of entries) {
          const page = Number((entry.target as HTMLElement).dataset.page);
          if (entry.isIntersecting && (!best || entry.intersectionRatio > best.ratio)) {
            best = { page, ratio: entry.intersectionRatio };
          }
        }
        if (best) setCurrentPage(best.page);
      },
      { root, threshold: [0.25, 0.5, 0.75] },
    );
    pageElRef.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, [numPages]);

  function goToPage(n: number) {
    const clamped = Math.min(Math.max(n, 1), numPages);
    pageElRef.current[clamped - 1]?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowDown" || e.key === "ArrowRight" || e.key === "PageDown") {
        e.preventDefault();
        goToPage(currentPage + 1);
      } else if (e.key === "ArrowUp" || e.key === "ArrowLeft" || e.key === "PageUp") {
        e.preventDefault();
        goToPage(currentPage - 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [currentPage, numPages]);

  if (error) {
    return <p className="flex h-full items-center justify-center text-sm text-white/80">{error}</p>;
  }

  return (
    <div className="relative h-full">
      {loading && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">Loading preview…</p>
      )}
      <div
        ref={containerRef}
        className={`flex h-full flex-col items-center gap-3 overflow-y-auto ${loading ? "invisible" : ""}`}
        onContextMenu={(e) => e.preventDefault()}
      >
        {Array.from({ length: numPages }, (_, i) => i + 1).map((n) => (
          <div
            key={n}
            data-page={n}
            ref={(el) => {
              pageElRef.current[n - 1] = el;
            }}
          >
            <canvas className="rounded bg-white shadow-lg" />
          </div>
        ))}
      </div>
      {!loading && numPages > 1 && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black/50 px-4 py-1.5 text-sm text-white">
          {currentPage} / {numPages}
        </div>
      )}
    </div>
  );
}

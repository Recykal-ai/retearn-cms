"use client";

import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { useToast } from "@/components/ToastProvider";
import { openGoogleViewer } from "@/lib/google-viewer";

// pdf/image/text/spreadsheet are the only kinds this modal ever renders now
// — docx and unsupported route straight to Google Viewer before this modal
// ever opens (see useDocumentViewer's openResult). The type still needs
// every ViewerKind value since kindFor() computes the full set to decide
// that early routing.
export type ViewerKind = "pdf" | "image" | "text" | "spreadsheet" | "docx" | "unsupported";

// A comfortable single-page reading width, independent of how wide the modal
// itself is — otherwise a page fit to the full modal width on a large
// monitor renders noticeably larger than a typical document viewer.
const MAX_PAGE_WIDTH = 760;

type FreshUrlFetcher = () => Promise<{ url: string; sourceType: "FILE" | "LINK" }>;

// PDF's own header fallback, for the rare file pdf.js itself can't parse —
// docx/pptx/unsupported no longer need this here at all, they route to
// Google Viewer directly on click (see useDocumentViewer).
function OpenWithGoogleButton({ getFreshUrl }: { getFreshUrl: FreshUrlFetcher }) {
  const [loading, setLoading] = useState(false);
  const { show } = useToast();

  function handleClick() {
    setLoading(true);
    openGoogleViewer(getFreshUrl, () => show("Couldn't open Google Viewer — try again.", "error")).finally(() =>
      setLoading(false),
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

// PDF renders onto our own <canvas> via pdf.js instead of embedding the
// browser's native PDF viewer (iframe + #toolbar=0 is unreliable — modern
// Chrome largely ignores that fragment and shows its own download button
// anyway), with a "Open with Google Viewer" header fallback for the rare
// file pdf.js itself can't parse. Spreadsheet renders as a real parsed table
// (SheetJS). Image/text render natively.
export function DocumentViewerModal({
  title,
  url,
  kind,
  getFreshUrl,
  fallbackUrl,
  onClose,
}: {
  title: string;
  url: string;
  kind: ViewerKind;
  getFreshUrl: FreshUrlFetcher;
  // Only meaningful for kind: "spreadsheet" sourced from a Google Sheets
  // LINK doc — the original Sheets URL, offered if the in-app export fails.
  fallbackUrl?: string;
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
          {kind === "pdf" && <OpenWithGoogleButton getFreshUrl={getFreshUrl} />}
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
        {kind === "spreadsheet" && <SpreadsheetViewer url={url} fallbackUrl={fallbackUrl} />}
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

interface SpreadsheetCell {
  text: string;
  bg?: string;
  color?: string;
  bold?: boolean;
  italic?: boolean;
  align?: "left" | "center" | "right" | "justify";
  wrap?: boolean;
  fontFamily?: string;
  fontSize?: number;
  border?: { top?: string; right?: string; bottom?: string; left?: string };
  rowSpan?: number;
  colSpan?: number;
}

interface SheetData {
  name: string;
  rows: (SpreadsheetCell | null)[][]; // null = covered by a merged cell — skip rendering, the anchor's rowSpan/colSpan covers it
  colWidths: number[];
  truncated: boolean;
}

const MAX_SPREADSHEET_ROWS = 500;
const MAX_SPREADSHEET_COLS = 100;
const DEFAULT_COL_WIDTH = 90;

// Picks readable text over a fill color when the source file didn't specify
// its own font color (common — many sheets only set a background fill and
// rely on the spreadsheet app's default black/white text contrast, which
// isn't something SheetJS's cell style object tells us directly).
function contrastTextColor(hexBg: string): string {
  const r = parseInt(hexBg.slice(1, 3), 16);
  const g = parseInt(hexBg.slice(3, 5), 16);
  const b = parseInt(hexBg.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.55 ? "#171717" : "#ffffff";
}

// SheetJS reports ARGB as an 8-char hex sometimes ("FF1F4E79") and plain RGB
// other times ("1F4E79") — the last 6 chars are always the actual color.
function hexFromRgb(rgb: string): string {
  return `#${rgb.slice(-6)}`;
}

interface StyleExtra {
  color?: string;
  align?: SpreadsheetCell["align"];
  wrap?: boolean;
  fontFamily?: string;
  fontSize?: number;
  border?: SpreadsheetCell["border"];
}

// SheetJS's free/community build only ever exposes fill color (verified by
// writing a file with explicit font/border/alignment via a known-good writer
// and reading it back — those three came back empty; only fill survived).
// Font color, alignment, wrap, and borders are a paid SheetJS Pro feature.
// ExcelJS (also free/open-source) reads all of that correctly — verified the
// same way. But ExcelJS is stricter about spec-compliant OOXML than SheetJS
// and can fail on files SheetJS tolerates fine, so it's used here as a
// best-effort *enrichment* pass on top of SheetJS's already-reliable grid,
// not a replacement for it — if ExcelJS can't parse a given file, this
// silently contributes nothing and the SheetJS-only styling (fill/merges/
// widths) still renders exactly as before.
async function tryEnrichWithExcelJS(buffer: ArrayBuffer): Promise<Map<string, StyleExtra> | null> {
  try {
    const ExcelJS = (await import("exceljs")).default;
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const extras = new Map<string, StyleExtra>();
    for (const ws of workbook.worksheets) {
      ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
        row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
          const extra: StyleExtra = {};
          if (cell.font?.color?.argb) extra.color = hexFromRgb(cell.font.color.argb);
          if (cell.font?.name) extra.fontFamily = cell.font.name;
          if (cell.font?.size) extra.fontSize = cell.font.size;
          if (cell.alignment?.horizontal) {
            const h = cell.alignment.horizontal;
            if (h === "left" || h === "center" || h === "right" || h === "justify") extra.align = h;
          }
          if (cell.alignment?.wrapText) extra.wrap = true;
          const b = cell.border;
          if (b?.top || b?.right || b?.bottom || b?.left) {
            extra.border = {
              top: b.top?.color?.argb ? hexFromRgb(b.top.color.argb) : b.top ? "#000000" : undefined,
              right: b.right?.color?.argb ? hexFromRgb(b.right.color.argb) : b.right ? "#000000" : undefined,
              bottom: b.bottom?.color?.argb ? hexFromRgb(b.bottom.color.argb) : b.bottom ? "#000000" : undefined,
              left: b.left?.color?.argb ? hexFromRgb(b.left.color.argb) : b.left ? "#000000" : undefined,
            };
          }
          if (Object.keys(extra).length > 0) extras.set(`${ws.name}!${rowNumber - 1}:${colNumber - 1}`, extra);
        });
      });
    }
    return extras;
  } catch {
    return null;
  }
}

// Parses the workbook client-side via SheetJS (installed from SheetJS's own
// CDN — the npm-registry release has known high-severity CVEs SheetJS never
// backported there). cellStyles: true genuinely does expose fill colors even
// in the free/community build (verified directly against a real file) — read
// range, merges, and column widths, and reproduce the actual grid instead of
// re-deriving a plain values-only table, which is what made the previous
// version not look like the source file (no colors, no merged title cells,
// no real column widths). Covers .xlsx/.xls/.xlsm/.ods and, since it reads
// just as naturally, .csv/.tsv too (a parsed table reads far better than raw
// comma-separated text). Font color/alignment/wrap/borders are then layered
// on top via ExcelJS, see tryEnrichWithExcelJS above.
function SpreadsheetViewer({ url, fallbackUrl }: { url: string; fallbackUrl?: string }) {
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [activeSheet, setActiveSheet] = useState(0);
  const [error, setError] = useState("");
  const [noAccess, setNoAccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const XLSX = await import("xlsx");
        const res = await fetch(url);
        if (!res.ok) {
          // 403 from our own /sheet-export route specifically means "this
          // Google account doesn't have Drive access to this sheet (or the
          // grant expired)" — worth a distinct message + a way to still open
          // it directly, rather than reading as a generic parse failure.
          if (res.status === 403 && fallbackUrl) setNoAccess(true);
          throw new Error();
        }
        const buffer = await res.arrayBuffer();
        const [workbook, extras] = await Promise.all([
          Promise.resolve(XLSX.read(buffer, { type: "array", cellStyles: true })),
          tryEnrichWithExcelJS(buffer),
        ]);
        if (cancelled) return;

        const parsed: SheetData[] = workbook.SheetNames.map((name) => {
          const ws = workbook.Sheets[name];
          if (!ws["!ref"]) return { name, rows: [], colWidths: [], truncated: false };

          const range = XLSX.utils.decode_range(ws["!ref"]);
          const maxRow = Math.min(range.e.r, range.s.r + MAX_SPREADSHEET_ROWS - 1);
          const maxCol = Math.min(range.e.c, range.s.c + MAX_SPREADSHEET_COLS - 1);

          const mergeAnchors = new Map<string, { rowSpan: number; colSpan: number }>();
          const mergeCovered = new Set<string>();
          for (const m of ws["!merges"] ?? []) {
            mergeAnchors.set(`${m.s.r}:${m.s.c}`, { rowSpan: m.e.r - m.s.r + 1, colSpan: m.e.c - m.s.c + 1 });
            for (let r = m.s.r; r <= m.e.r; r++) {
              for (let c = m.s.c; c <= m.e.c; c++) {
                if (r === m.s.r && c === m.s.c) continue;
                mergeCovered.add(`${r}:${c}`);
              }
            }
          }

          const rows: (SpreadsheetCell | null)[][] = [];
          for (let r = range.s.r; r <= maxRow; r++) {
            const rowOut: (SpreadsheetCell | null)[] = [];
            for (let c = range.s.c; c <= maxCol; c++) {
              const key = `${r}:${c}`;
              if (mergeCovered.has(key)) {
                rowOut.push(null);
                continue;
              }
              const cell = ws[XLSX.utils.encode_cell({ r, c })];
              const text = cell?.w ?? (cell?.v != null ? String(cell.v) : "");
              const style = cell?.s as
                | { patternType?: string; fgColor?: { rgb?: string }; font?: { bold?: boolean; italic?: boolean } }
                | undefined;
              const bg = style?.patternType === "solid" && style.fgColor?.rgb ? hexFromRgb(style.fgColor.rgb) : undefined;
              const span = mergeAnchors.get(key);
              const extra = extras?.get(`${name}!${r}:${c}`);
              rowOut.push({
                text,
                bg,
                color: extra?.color ?? (bg ? contrastTextColor(bg) : undefined),
                bold: style?.font?.bold,
                italic: style?.font?.italic,
                align: extra?.align,
                wrap: extra?.wrap,
                fontFamily: extra?.fontFamily,
                fontSize: extra?.fontSize,
                border: extra?.border,
                rowSpan: span?.rowSpan,
                colSpan: span?.colSpan,
              });
            }
            rows.push(rowOut);
          }

          const colWidths: number[] = [];
          for (let c = range.s.c; c <= maxCol; c++) {
            colWidths.push(ws["!cols"]?.[c]?.wpx ?? DEFAULT_COL_WIDTH);
          }

          return { name, rows, colWidths, truncated: range.e.r - range.s.r + 1 > MAX_SPREADSHEET_ROWS };
        });
        setSheets(parsed);
      } catch {
        if (!cancelled) setError("Couldn't load this spreadsheet.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, fallbackUrl]);

  if (noAccess && fallbackUrl) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <p className="text-sm text-white/80">You don&apos;t have access to this sheet in Google.</p>
        <a
          href={fallbackUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium underline underline-offset-2"
          style={{ color: "white" }}
        >
          Try opening it directly in Google Sheets ↗
        </a>
      </div>
    );
  }
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
          <table className="text-xs" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              {sheet.colWidths.map((w, i) => (
                <col key={i} style={{ width: w }} />
              ))}
            </colgroup>
            <tbody>
              {sheet.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map(
                    (cell, ci) =>
                      cell && (
                        <td
                          key={ci}
                          rowSpan={cell.rowSpan}
                          colSpan={cell.colSpan}
                          className="overflow-hidden border border-neutral-200 px-2 py-1 text-ellipsis"
                          style={{
                            background: cell.bg,
                            color: cell.color ?? "#262626",
                            fontWeight: cell.bold ? 700 : undefined,
                            fontStyle: cell.italic ? "italic" : undefined,
                            fontFamily: cell.fontFamily,
                            fontSize: cell.fontSize,
                            textAlign: cell.align,
                            whiteSpace: cell.wrap ? "normal" : "nowrap",
                            borderTop: cell.border?.top ? `1px solid ${cell.border.top}` : undefined,
                            borderRight: cell.border?.right ? `1px solid ${cell.border.right}` : undefined,
                            borderBottom: cell.border?.bottom ? `1px solid ${cell.border.bottom}` : undefined,
                            borderLeft: cell.border?.left ? `1px solid ${cell.border.left}` : undefined,
                          }}
                        >
                          {cell.text}
                        </td>
                      ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {sheet.truncated && (
        <p className="mt-2 shrink-0 text-xs text-white/50 italic">Showing the first {MAX_SPREADSHEET_ROWS} rows.</p>
      )}
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

"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { DocumentSummary, SortField, SortDir } from "@/lib/api";
import { DocumentRow } from "@/components/dashboard/DocumentRow";
import { useDocumentViewer } from "@/components/dashboard/useDocumentViewer";
import { Icon } from "@/components/dashboard/Icon";
import { Pagination } from "@/components/dashboard/Pagination";

export function DocumentsTable({
  documents,
  mode,
  entityId,
  entityName,
  sort,
  dir,
  nameAscHref,
  nameDescHref,
  modifiedAscHref,
  modifiedDescHref,
  showStatus,
  isAdmin,
  currentUserId,
  restrictToPublished,
}: {
  documents: DocumentSummary[];
  mode: "team" | "product" | "all";
  entityId?: string;
  entityName?: string;
  sort?: SortField;
  dir?: SortDir;
  nameAscHref: string;
  nameDescHref: string;
  modifiedAscHref: string;
  modifiedDescHref: string;
  showStatus?: boolean;
  isAdmin?: boolean;
  currentUserId?: string;
  restrictToPublished?: boolean;
}) {
  const PAGE_SIZE = 10;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const { view, isOpening, viewerNode } = useDocumentViewer();

  const filtered = query.trim()
    ? documents.filter((d) => d.title.toLowerCase().includes(query.trim().toLowerCase()))
    : documents;

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  // Clamped rather than reset via effect — if a search/filter shrinks the
  // list while sitting on a now out-of-range page, this snaps back to the
  // last valid page on the very next render instead of showing a blank one.
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function onQueryChange(next: string) {
    setQuery(next);
    setPage(1);
  }

  return (
    // flex column filling the panel's full height — pushes pagination down
    // to the bottom edge via the table wrapper's flex-1, instead of it
    // sitting directly under the last row (which made it visibly jump
    // upward on a short last page instead of staying put at the bottom).
    <div className="flex h-full flex-col">
    <div className="flex-1">
    <table className="w-full text-left text-sm">
      <thead>
        <tr>
          <td colSpan={5} className="pb-3">
            {/* Always visible, its own row above Name/Tags/Modified/Modified
                by — not gated behind a click, and not swapped in place of
                the Name header (that briefly replaced this, but reads worse
                than just always having the box where you'd look for it). */}
            <div className="relative w-full max-w-xs">
              <Icon
                name="Interface/Search_Magnifying_Glass"
                size={13}
                style={{ color: "#a3a3a3" }}
                className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
              />
              <input
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder={`Search in ${entityName ?? "this list"}`}
                className="w-full rounded-md border border-neutral-200 bg-white py-1.5 pr-3 pl-8 text-xs text-neutral-700 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600"
              />
            </div>
          </td>
        </tr>
        <tr className="text-xs font-semibold text-neutral-500">
          <th className="sticky top-0 z-10 border-b border-neutral-100 bg-white py-3 font-semibold dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center gap-2">
              {/* Decorative, not interactive — lines the header up with each
                  row's own star (pin) + file-type icon columns below it,
                  same as Tags/Modified/Modified by aligning with their own
                  columns. */}
              <Icon name="Interface/Star" size={15} className="shrink-0 text-neutral-300 dark:text-neutral-600" />
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-neutral-300 dark:text-neutral-600">
                <path
                  d="M7 3.5h7.5L18 7v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
                <path d="M14 3.5V7h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              </svg>
              <SortableHeader
                label="Name"
                ascHref={nameAscHref}
                descHref={nameDescHref}
                ascLabel="A to Z"
                descLabel="Z to A"
                active={sort === "name"}
                dir={dir}
              />
            </div>
          </th>
          <th className="sticky top-0 z-10 border-b border-neutral-100 bg-white py-3 font-semibold dark:border-neutral-800 dark:bg-neutral-900">Tags</th>
          <th className="sticky top-0 z-10 w-36 border-b border-neutral-100 bg-white py-3 font-semibold dark:border-neutral-800 dark:bg-neutral-900">
            <SortableHeader
              label="Modified"
              ascHref={modifiedAscHref}
              descHref={modifiedDescHref}
              ascLabel="Oldest first"
              descLabel="Newest first"
              active={sort === "modified"}
              dir={dir ?? "desc"}
            />
          </th>
          <th className="sticky top-0 z-10 w-40 border-b border-neutral-100 bg-white py-3 font-semibold dark:border-neutral-800 dark:bg-neutral-900">Modified by</th>
          <th className="sticky top-0 z-10 w-28 border-b border-neutral-100 bg-white py-3 font-normal dark:border-neutral-800 dark:bg-neutral-900" />
        </tr>
      </thead>
      <tbody>
        {filtered.length === 0 ? (
          <tr>
            <td colSpan={5} className="py-16">
              <div className="flex flex-col items-center gap-3 text-center">
                <Icon name="File/Files" size={36} style={{ color: "#c9c2ce" }} />
                <div>
                  <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                    {query ? `No matches for "${query}"` : `No documents in ${entityName ?? "this view"} yet`}
                  </p>
                  {!query && (
                    <p className="mt-1 text-xs text-neutral-400 dark:text-neutral-500">
                      Files uploaded here will show up in this list once approved.
                    </p>
                  )}
                </div>
              </div>
            </td>
          </tr>
        ) : (
          paged.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              mode={mode}
              entityId={entityId}
              showStatus={showStatus}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              onView={view}
              opening={isOpening(doc.id)}
              restrictToPublished={restrictToPublished}
            />
          ))
        )}
      </tbody>
    </table>
    </div>
    {pageCount > 1 && (
      <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} />
    )}
    {viewerNode}
    </div>
  );
}

function SortableHeader({
  label,
  ascHref,
  descHref,
  ascLabel,
  descLabel,
  active,
  dir,
}: {
  label: string;
  ascHref: string;
  descHref: string;
  ascLabel: string;
  descLabel: string;
  active: boolean;
  dir?: SortDir;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={detailsRef} className="relative inline-block">
      <summary
        className={`inline-flex cursor-pointer list-none items-center gap-1 hover:text-neutral-700 dark:hover:text-neutral-300 ${active ? "text-neutral-700 dark:text-neutral-300" : ""}`}
      >
        {label}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          className={active ? "text-neutral-600 dark:text-neutral-400" : "text-neutral-400 dark:text-neutral-500"}
          style={{
            transform: active && dir === "asc" ? "rotate(180deg)" : undefined,
            transition: "transform 0.15s",
          }}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="absolute top-full left-0 z-10 mt-1 w-36 rounded-md border border-neutral-200 bg-white py-1 text-xs font-normal text-neutral-700 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
        <Link
          href={ascHref}
          onClick={() => detailsRef.current && (detailsRef.current.open = false)}
          className={`block px-3 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-800 ${active && dir === "asc" ? "font-semibold text-neutral-900 dark:text-neutral-200" : ""}`}
        >
          {ascLabel}
        </Link>
        <Link
          href={descHref}
          onClick={() => detailsRef.current && (detailsRef.current.open = false)}
          className={`block px-3 py-1.5 hover:bg-neutral-50 dark:hover:bg-neutral-800 ${active && dir !== "asc" ? "font-semibold text-neutral-900 dark:text-neutral-200" : ""}`}
        >
          {descLabel}
        </Link>
      </div>
    </details>
  );
}


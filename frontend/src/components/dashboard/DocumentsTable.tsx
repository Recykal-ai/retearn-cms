"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { DocumentSummary, SortField, SortDir } from "@/lib/api";
import { DocumentRow } from "@/components/dashboard/DocumentRow";
import { useDocumentViewer } from "@/components/dashboard/useDocumentViewer";

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
}) {
  const PAGE_SIZE = 10;
  const [searchOpen, setSearchOpen] = useState(false);
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
        <tr className="text-xs font-semibold text-neutral-500">
          <th className="sticky top-0 z-10 border-b border-neutral-100 bg-white py-3 font-semibold">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSearchOpen((v) => !v)}
                title="Find in this list"
                className="text-neutral-400 hover:text-neutral-600"
              >
                <SearchIcon />
              </button>
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
          <th className="sticky top-0 z-10 border-b border-neutral-100 bg-white py-3 font-semibold">Tags</th>
          <th className="sticky top-0 z-10 w-36 border-b border-neutral-100 bg-white py-3 font-semibold">
            <SortableHeader
              label="Modified"
              ascHref={modifiedAscHref}
              descHref={modifiedDescHref}
              ascLabel="Oldest first"
              descLabel="Newest first"
              active={sort === "modified" || !sort}
              dir={dir ?? "desc"}
            />
          </th>
          <th className="sticky top-0 z-10 w-40 border-b border-neutral-100 bg-white py-3 font-semibold">Modified by</th>
          <th className="sticky top-0 z-10 w-28 border-b border-neutral-100 bg-white py-3 font-normal" />
        </tr>
        {searchOpen && (
          <tr>
            <td colSpan={5} className="bg-neutral-50 px-2 py-2">
              <input
                autoFocus
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder={`Find in ${entityName ?? "this list"}…`}
                className="w-full max-w-xs rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none"
              />
            </td>
          </tr>
        )}
      </thead>
      <tbody>
        {filtered.length === 0 ? (
          <tr>
            <td colSpan={5} className="py-16">
              <div className="flex flex-col items-center gap-3 text-center">
                <DocumentStackIcon />
                <div>
                  <p className="text-sm font-medium text-neutral-600">
                    {query ? `No matches for "${query}"` : `No documents in ${entityName ?? "this view"} yet`}
                  </p>
                  {!query && (
                    <p className="mt-1 text-xs text-neutral-400">
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

function Pagination({ page, pageCount, onChange }: { page: number; pageCount: number; onChange: (page: number) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 border-t border-neutral-100 py-3">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        Prev
      </button>
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-current={n === page ? "page" : undefined}
          className="min-w-7 rounded-md px-2 py-1 text-xs font-medium transition-colors"
          style={
            n === page
              ? { background: "var(--brand-purple)", color: "white" }
              : { color: "#525252" }
          }
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page === pageCount}
        className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        Next
      </button>
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
        className="inline-flex cursor-pointer list-none items-center gap-1 hover:text-neutral-700"
        style={{ color: active ? "#404040" : undefined }}
      >
        {label}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          style={{
            color: active ? "#525252" : "#a3a3a3",
            transform: active && dir === "asc" ? "rotate(180deg)" : undefined,
            transition: "transform 0.15s",
          }}
        >
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="absolute top-full left-0 z-10 mt-1 w-36 rounded-md border border-neutral-200 bg-white py-1 text-xs font-normal text-neutral-700 shadow-lg">
        <Link
          href={ascHref}
          onClick={() => detailsRef.current && (detailsRef.current.open = false)}
          className={`block px-3 py-1.5 hover:bg-neutral-50 ${active && dir === "asc" ? "font-semibold text-neutral-900" : ""}`}
        >
          {ascLabel}
        </Link>
        <Link
          href={descHref}
          onClick={() => detailsRef.current && (detailsRef.current.open = false)}
          className={`block px-3 py-1.5 hover:bg-neutral-50 ${active && dir !== "asc" ? "font-semibold text-neutral-900" : ""}`}
        >
          {descLabel}
        </Link>
      </div>
    </details>
  );
}

function SearchIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function DocumentStackIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "#c9c2ce" }}>
      <path
        d="M7 3.5h7.5L18 7v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M14 3.5V7h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 12h6M9 15.5h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

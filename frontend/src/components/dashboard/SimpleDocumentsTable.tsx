"use client";

import { useState } from "react";
import type { DocumentSummary } from "@/lib/api";
import { DocumentRow } from "@/components/dashboard/DocumentRow";
import { useDocumentViewer } from "@/components/dashboard/useDocumentViewer";
import { Icon } from "@/components/dashboard/Icon";
import { Pagination } from "@/components/dashboard/Pagination";

const PAGE_SIZE = 10;

// List-view sibling of DocumentsCardGrid — same self-contained search +
// DocumentRow-per-row rendering, plus pagination (DocumentsCardGrid has
// neither pagination nor DocumentsTable's URL-driven sort headers). Used by
// Pinned/Recent, whose documents come pre-filtered/pre-ordered from the
// parent as a plain in-memory array with nowhere meaningful to link a
// server-side sort to — so unlike DocumentsTable this never renders
// sortable column headers, just plain labels.
export function SimpleDocumentsTable({
  documents,
  entityName,
}: {
  documents: DocumentSummary[];
  entityName?: string;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const { view, isOpening, viewerNode } = useDocumentViewer();

  const filtered = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter(
      (d) => d.title.toLowerCase().includes(q) || d.categories.some((c) => c.name.toLowerCase().includes(q)),
    );
  })();

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function onQueryChange(next: string) {
    setQuery(next);
    setPage(1);
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">
              <th className="sticky top-0 z-10 border-b border-neutral-100 bg-white py-3 font-semibold dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setSearchOpen((v) => !v)}
                    title="Find in this list"
                    className="text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
                  >
                    <Icon name="Interface/Search_Magnifying_Glass" size={13} />
                  </button>
                  Name
                </div>
              </th>
              <th className="sticky top-0 z-10 border-b border-neutral-100 bg-white py-3 font-semibold dark:border-neutral-800 dark:bg-neutral-900">Tags</th>
              <th className="sticky top-0 z-10 w-36 border-b border-neutral-100 bg-white py-3 font-semibold dark:border-neutral-800 dark:bg-neutral-900">Modified</th>
              <th className="sticky top-0 z-10 w-40 border-b border-neutral-100 bg-white py-3 font-semibold dark:border-neutral-800 dark:bg-neutral-900">Modified by</th>
              <th className="sticky top-0 z-10 w-28 border-b border-neutral-100 bg-white py-3 font-normal dark:border-neutral-800 dark:bg-neutral-900" />
            </tr>
            {searchOpen && (
              <tr>
                <td colSpan={5} className="bg-neutral-50 px-2 py-2 dark:bg-neutral-800">
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => onQueryChange(e.target.value)}
                    placeholder={`Find in ${entityName ?? "this list"}…`}
                    className="w-full max-w-xs rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-xs text-neutral-700 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600"
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
                    <Icon name="File/Files" size={36} style={{ color: "#c9c2ce" }} />
                    <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">
                      {query ? `No matches for "${query}"` : `Nothing in ${entityName ?? "this view"} yet`}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              paged.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  doc={doc}
                  mode="all"
                  onView={view}
                  opening={isOpening(doc.id)}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} />}
      {viewerNode}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import type { Category, DocumentSummary } from "@/lib/api";
import { colorForCategory } from "@/lib/tag-colors";
import { Icon } from "@/components/dashboard/Icon";

export function FolderGrid({
  categories,
  documents,
  baseHref,
  scopeColors,
}: {
  categories: Category[];
  documents: DocumentSummary[];
  baseHref: string;
  scopeColors?: Record<string, { bg: string; fg: string }>;
}) {
  const [query, setQuery] = useState("");

  // A folder with nothing matching the active filters (e.g. a type=pdf
  // filter with no PDFs in that category) isn't worth showing as a tile —
  // it'd just be an empty, useless click. Matched by name rather than id:
  // within one scope a name is already unique (schema's @@unique([name,
  // scope])) so this is equivalent there, and it's what makes this work at
  // all for the "all" mode's synthetic categories, whose id IS the name
  // (see page.tsx) rather than a real category row id.
  const nonEmpty = categories
    .map((c) => ({ category: c, count: documents.filter((d) => d.categories.some((dc) => dc.name === c.name)).length }))
    .filter((entry) => entry.count > 0);

  const filtered = query.trim()
    ? nonEmpty.filter(({ category: c }) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : nonEmpty;

  if (nonEmpty.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <FolderIcon size={36} color="#c9c2ce" />
        <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">No category folders here yet</p>
      </div>
    );
  }

  return (
    <div>
      <div className="relative mb-4 max-w-xs">
        <Icon
          name="Interface/Search_Magnifying_Glass"
          size={13}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400 dark:text-neutral-500"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a folder…"
          className="w-full rounded-md border border-neutral-200 bg-white py-1.5 pr-3 pl-8 text-xs text-neutral-700 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <FolderIcon size={36} color="#c9c2ce" />
          <p className="text-sm font-medium text-neutral-600 dark:text-neutral-400">No matches for &ldquo;{query}&rdquo;</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {filtered.map(({ category: c, count }) => {
            const color = colorForCategory(c, scopeColors);
            // Categories are flat — opening one has no further folder
            // structure to show, so this always lands in list view, not
            // folder view. Built via the URL API (not template-string
            // concatenation) specifically to overwrite baseHref's own
            // `view=folders`, not append a second, ambiguous `view` param
            // alongside it — the previous plain-concat version left the URL
            // still saying `view=folders` once inside a category, which is
            // exactly what left the ViewSwitcher showing "Folders" as active
            // while a document list was actually on screen.
            const tileHref = (() => {
              const url = new URL(baseHref, "http://placeholder");
              url.searchParams.set("category", c.id);
              url.searchParams.set("view", "list");
              return `${url.pathname}${url.search}`;
            })();
            return (
              <Link
                key={c.id}
                href={tileHref}
                className="flex flex-col items-start gap-2 rounded-lg border border-neutral-200 p-4 transition-colors hover:border-neutral-300 hover:shadow-sm dark:border-neutral-700 dark:hover:border-neutral-600"
              >
                <FolderIcon size={28} color={color.fg} />
                <div>
                  <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">{c.name}</p>
                  <p className="text-xs text-neutral-400 dark:text-neutral-500">{count} document{count === 1 ? "" : "s"}</p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Deliberately kept as a hand-drawn SVG, not swapped for the icon pack — the
// translucent color fill (tinted per category, not just an outline) is the
// whole point of this one, and the pack's icons are outline-only (fill=none).
function FolderIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden style={{ color }}>
      <path
        d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-9Z"
        fill={color}
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

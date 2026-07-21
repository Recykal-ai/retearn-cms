"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import type { DocumentSummary } from "@/lib/api";
import { searchDocumentsAction } from "@/app/dashboard/search/search-actions";
import { useDocumentViewer } from "@/components/dashboard/useDocumentViewer";
import { FileTypeIcon } from "@/components/dashboard/FileTypeIcon";
import { Tag } from "@/components/dashboard/Tag";
import { fileTypeOf } from "@/lib/file-type";
import { colorForCategory, dedupeGlobalCategories, TEAM_TAG_COLOR, PRODUCT_TAG_COLOR } from "@/lib/tag-colors";
import { Icon } from "@/components/dashboard/Icon";

const DEBOUNCE_MS = 250;
const MAX_RESULTS = 8;

export function SearchBar({ query }: { query?: string }) {
  const [value, setValue] = useState(query ?? "");
  const [results, setResults] = useState<DocumentSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { view, isOpening, viewerNode } = useDocumentViewer();
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!next.trim()) {
      setResults([]);
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        const docs = await searchDocumentsAction(next);
        setResults(docs.slice(0, MAX_RESULTS));
        setOpen(true);
      });
    }, DEBOUNCE_MS);
  }

  async function handleSelect(doc: DocumentSummary) {
    await view(doc);
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative w-[480px] max-w-[45vw]">
      <form action="/dashboard/search" method="GET" autoComplete="off" className="relative">
        <Icon
          name="Interface/Search_Magnifying_Glass"
          size={15}
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400"
        />
        <input
          type="text"
          name="q"
          autoComplete="off"
          value={value}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search documents, teams, products…"
          className="w-full rounded-md border-0 bg-white/95 py-2 pr-4 pl-9 text-sm text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-white/60"
          style={{ fontFamily: "var(--font-ui)" }}
        />
      </form>

      {open && (
        <div
          className="absolute top-full left-0 z-30 mt-1.5 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-xl"
          style={{ fontFamily: "var(--font-ui)" }}
        >
          {isPending ? (
            <p className="px-4 py-3 text-sm text-neutral-400">Searching…</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-neutral-400">No matches for &ldquo;{value}&rdquo;</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto py-1">
              {results.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(doc)}
                    disabled={isOpening(doc.id)}
                    className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left hover:bg-neutral-50 disabled:opacity-60"
                  >
                    <FileTypeIcon type={fileTypeOf(doc.title, doc.sourceType)} />
                    <p className="min-w-0 shrink-0 truncate text-sm font-medium text-neutral-800" style={{ maxWidth: "45%" }}>
                      {isOpening(doc.id) ? "Opening…" : doc.title}
                    </p>
                    <div className="flex min-w-0 flex-1 flex-wrap justify-end gap-1">
                      {doc.ownerTeam && (
                        <Tag label={doc.ownerTeam.name} bg={TEAM_TAG_COLOR.bg} fg={TEAM_TAG_COLOR.fg} />
                      )}
                      {doc.products.map((p) => (
                        <Tag key={p.id} label={p.name} bg={PRODUCT_TAG_COLOR.bg} fg={PRODUCT_TAG_COLOR.fg} />
                      ))}
                      {dedupeGlobalCategories(doc.categories).map((c) => {
                        const color = colorForCategory(c);
                        return <Tag key={c.id} label={c.name} bg={color.bg} fg={color.fg} />;
                      })}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link
            href={`/dashboard/search?q=${encodeURIComponent(value)}`}
            onClick={() => setOpen(false)}
            className="block border-t border-neutral-100 px-4 py-2.5 text-center text-xs font-semibold hover:bg-neutral-50"
            style={{ color: "var(--brand-purple)" }}
          >
            See all results for &ldquo;{value}&rdquo;
          </Link>
        </div>
      )}
      {viewerNode}
    </div>
  );
}

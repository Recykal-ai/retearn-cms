"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DocumentSummary } from "@/lib/api";
import { DocumentsCardGrid } from "@/components/dashboard/DocumentsCardGrid";
import { FileTypeIcon } from "@/components/dashboard/FileTypeIcon";
import { fileTypeOf, FILE_TYPE_LABEL, type FileTypeKey } from "@/lib/file-type";
import { colorForCategory } from "@/lib/tag-colors";

// Pinned is a personal, cross-team/product list — its filter options are
// derived straight from whatever's actually pinned (no server round trip for
// a categoriesByScope catalog like the main dashboard's Filter panel needs),
// and kept as local state rather than URL params since there's nothing else
// on this page to deep-link back to.
export function PinnedPageContent({ documents }: { documents: DocumentSummary[] }) {
  const [open, setOpen] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const availableTypes = useMemo(() => {
    const set = new Set<FileTypeKey>();
    for (const d of documents) set.add(fileTypeOf(d.title, d.sourceType));
    return Array.from(set);
  }, [documents]);

  const availableCategories = useMemo(() => {
    const byName = new Map<string, { name: string; scope: string; isGlobal: boolean }>();
    for (const d of documents) {
      for (const c of d.categories) {
        if (!byName.has(c.name)) byName.set(c.name, c);
      }
    }
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [documents]);

  const activeCount = selectedTypes.length + selectedCategories.length;

  const filtered = documents.filter((d) => {
    if (selectedTypes.length && !selectedTypes.includes(fileTypeOf(d.title, d.sourceType))) return false;
    if (selectedCategories.length && !d.categories.some((c) => selectedCategories.includes(c.name))) return false;
    return true;
  });

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  return (
    <div>
      <div className="mb-4 flex justify-end" ref={panelRef}>
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
            style={
              activeCount > 0
                ? { borderColor: "var(--brand-purple)", color: "var(--brand-purple)", background: "var(--brand-purple-tint)" }
                : { borderColor: "#e5e5e5", color: "#525252" }
            }
          >
            Filter{activeCount > 0 ? ` (${activeCount})` : ""}
          </button>

          {open && (availableTypes.length > 0 || availableCategories.length > 0) && (
            <div className="absolute top-full right-0 z-20 mt-1 w-64 rounded-md border border-neutral-200 bg-white p-3 shadow-lg">
              {availableTypes.length > 0 && (
                <div className="mb-3 border-b border-neutral-100 pb-3">
                  <p className="mb-2 text-xs font-semibold text-neutral-600">Type</p>
                  <div className="flex flex-col gap-1.5">
                    {availableTypes.map((t) => (
                      <label key={t} className="flex items-center gap-2 text-sm text-neutral-700">
                        <input
                          type="checkbox"
                          checked={selectedTypes.includes(t)}
                          onChange={() => toggle(selectedTypes, setSelectedTypes, t)}
                        />
                        <FileTypeIcon type={t} />
                        {FILE_TYPE_LABEL[t]}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {availableCategories.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-semibold text-neutral-600">Tags</p>
                  <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto">
                    {availableCategories.map((c) => {
                      const color = colorForCategory(c);
                      return (
                        <label key={c.name} className="flex items-center gap-2 text-sm text-neutral-700">
                          <input
                            type="checkbox"
                            checked={selectedCategories.includes(c.name)}
                            onChange={() => toggle(selectedCategories, setSelectedCategories, c.name)}
                          />
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: color.fg }} aria-hidden />
                          {c.name}
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedTypes([]);
                    setSelectedCategories([]);
                  }}
                  className="mt-3 w-full rounded-md border border-neutral-200 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-400">No pinned documents match these filters.</p>
      ) : (
        <DocumentsCardGrid documents={filtered} entityName="Pinned" />
      )}
    </div>
  );
}

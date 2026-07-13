"use client";

import { useEffect, useMemo, useState } from "react";
import type { DocumentSummary } from "@/lib/api";
import { DocumentsCardGrid } from "@/components/dashboard/DocumentsCardGrid";
import { FileTypeIcon } from "@/components/dashboard/FileTypeIcon";
import { fileTypeOf, FILE_TYPE_LABEL, type FileTypeKey } from "@/lib/file-type";
import { colorForCategory } from "@/lib/tag-colors";

// Pinned is a personal, cross-team/product list — its filter options are
// derived straight from whatever's actually pinned (no server round trip for
// a categoriesByScope catalog like the main dashboard's Filter panel needs),
// and kept as local state rather than URL params since there's nothing else
// on this page to deep-link back to. The drawer shell itself (right-side
// slide-in, same header/section/footer markup) intentionally mirrors
// FilterPanel.tsx's rather than using its own popover style, so filtering
// looks and behaves the same everywhere in the app.
export function PinnedPageContent({ documents }: { documents: DocumentSummary[] }) {
  const [open, setOpen] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const availableTypes = useMemo(() => {
    const set = new Set<FileTypeKey>();
    for (const d of documents) set.add(fileTypeOf(d.title, d.sourceType));
    return Array.from(set);
  }, [documents]);

  const availableTeams = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const d of documents) {
      if (d.ownerTeam && !byId.has(d.ownerTeam.id)) byId.set(d.ownerTeam.id, d.ownerTeam);
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [documents]);

  const availableProducts = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const d of documents) {
      for (const p of d.products) {
        if (!byId.has(p.id)) byId.set(p.id, p);
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [documents]);

  const availableCategories = useMemo(() => {
    const byName = new Map<string, { name: string; scope: string; isGlobal: boolean }>();
    for (const d of documents) {
      for (const c of d.categories) {
        if (!byName.has(c.name)) byName.set(c.name, c);
      }
    }
    // Global tags first, alphabetical within each group — matches the order
    // used everywhere else categories are listed.
    return Array.from(byName.values()).sort((a, b) => {
      const globalDiff = Number(b.isGlobal) - Number(a.isGlobal);
      return globalDiff !== 0 ? globalDiff : a.name.localeCompare(b.name);
    });
  }, [documents]);

  const activeCount = selectedTypes.length + selectedTeams.length + selectedProducts.length + selectedCategories.length;

  const filtered = documents.filter((d) => {
    if (selectedTypes.length && !selectedTypes.includes(fileTypeOf(d.title, d.sourceType))) return false;
    if (selectedTeams.length && !(d.ownerTeam && selectedTeams.includes(d.ownerTeam.id))) return false;
    if (selectedProducts.length && !d.products.some((p) => selectedProducts.includes(p.id))) return false;
    if (selectedCategories.length && !d.categories.some((c) => selectedCategories.includes(c.name))) return false;
    return true;
  });

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function clear() {
    setSelectedTypes([]);
    setSelectedTeams([]);
    setSelectedProducts([]);
    setSelectedCategories([]);
  }

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
          style={
            activeCount > 0
              ? { borderColor: "var(--brand-purple)", color: "var(--brand-purple)", background: "var(--brand-purple-tint)" }
              : { borderColor: "#e5e5e5", color: "#525252" }
          }
        >
          Filter{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="flex-1 bg-black/20" onClick={() => setOpen(false)} />
          <div
            className="flex h-full w-80 flex-col overflow-y-auto bg-white shadow-xl"
            style={{ fontFamily: "var(--font-ui)" }}
          >
            <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
              <h2 className="text-base font-semibold text-neutral-900">Filters</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="text-xl leading-none text-neutral-400 hover:text-neutral-600"
              >
                ×
              </button>
            </div>

            <div className="flex-1 px-5 py-4">
              {availableTypes.length > 0 && (
                <FilterSection title={`Type${selectedTypes.length ? ` (${selectedTypes.length})` : ""}`}>
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
                </FilterSection>
              )}

              {availableTeams.length > 0 && (
                <FilterSection title={`Team${selectedTeams.length ? ` (${selectedTeams.length})` : ""}`}>
                  <div className="flex flex-col gap-1.5">
                    {availableTeams.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-sm text-neutral-700">
                        <input
                          type="checkbox"
                          checked={selectedTeams.includes(t.id)}
                          onChange={() => toggle(selectedTeams, setSelectedTeams, t.id)}
                        />
                        {t.name}
                      </label>
                    ))}
                  </div>
                </FilterSection>
              )}

              {availableProducts.length > 0 && (
                <FilterSection title={`Product${selectedProducts.length ? ` (${selectedProducts.length})` : ""}`}>
                  <div className="flex flex-col gap-1.5">
                    {availableProducts.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 text-sm text-neutral-700">
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(p.id)}
                          onChange={() => toggle(selectedProducts, setSelectedProducts, p.id)}
                        />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </FilterSection>
              )}

              {availableCategories.length > 0 && (
                <FilterSection title={`Tags${selectedCategories.length ? ` (${selectedCategories.length})` : ""}`} last>
                  <div className="flex flex-col gap-1.5">
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
                </FilterSection>
              )}
            </div>

            <div className="border-t border-neutral-100 px-5 py-4">
              <button
                type="button"
                onClick={clear}
                className="w-full rounded-md border border-neutral-200 py-2 text-sm font-medium text-neutral-600"
              >
                Clear all
              </button>
            </div>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-400">No pinned documents match these filters.</p>
      ) : (
        <DocumentsCardGrid documents={filtered} entityName="Pinned" />
      )}
    </div>
  );
}

function FilterSection({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={last ? "" : "mb-5 border-b border-neutral-100 pb-5"}>
      <p className="mb-2 text-xs font-semibold text-neutral-600">{title}</p>
      {children}
    </div>
  );
}

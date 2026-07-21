"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { DeletedDocumentSummary } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import { FileTypeIcon } from "@/components/dashboard/FileTypeIcon";
import { Tag } from "@/components/dashboard/Tag";
import { fileTypeOf, FILE_TYPE_LABEL, type FileTypeKey } from "@/lib/file-type";
import { colorForCategory, dedupeGlobalCategories, TEAM_TAG_COLOR, PRODUCT_TAG_COLOR } from "@/lib/tag-colors";
import { recoverDocumentAction } from "@/app/dashboard/recycle-bin/recycle-bin-actions";
import { Icon } from "@/components/dashboard/Icon";

// Same presets as the main dashboard's FilterPanel "Modified" section, but
// applied to deletedBy.at (when the doc was deleted) rather than updatedAt —
// the thing you'd actually want to narrow down here.
const DATE_PRESETS: { value: string; label: string }[] = [
  { value: "", label: "Any time" },
  { value: "1", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
];

// Search box + filter drawer mirror Pinned's exact pattern (PinnedPageContent
// / DocumentsCardGrid's "Find in X…" box) — same local-state, derived-from-
// what's-actually-here approach, no URL params or server round trip, since
// the Recycle Bin is a small, admin-only, already-fully-loaded list.
export function RecycleBinList({ documents }: { documents: DeletedDocumentSummary[] }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState("");

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
    return Array.from(byName.values()).sort((a, b) => {
      const globalDiff = Number(b.isGlobal) - Number(a.isGlobal);
      return globalDiff !== 0 ? globalDiff : a.name.localeCompare(b.name);
    });
  }, [documents]);

  const activeCount =
    selectedTypes.length + selectedTeams.length + selectedProducts.length + selectedCategories.length + (selectedDays ? 1 : 0);

  const filtered = documents.filter((d) => {
    const q = query.trim().toLowerCase();
    if (q && !d.title.toLowerCase().includes(q) && !d.categories.some((c) => c.name.toLowerCase().includes(q))) {
      return false;
    }
    if (selectedTypes.length && !selectedTypes.includes(fileTypeOf(d.title, d.sourceType))) return false;
    if (selectedTeams.length && !(d.ownerTeam && selectedTeams.includes(d.ownerTeam.id))) return false;
    if (selectedProducts.length && !d.products.some((p) => selectedProducts.includes(p.id))) return false;
    if (selectedCategories.length && !d.categories.some((c) => selectedCategories.includes(c.name))) return false;
    if (selectedDays) {
      const cutoff = Date.now() - Number(selectedDays) * 86400000;
      if (!d.deletedBy || new Date(d.deletedBy.at).getTime() < cutoff) return false;
    }
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
    setSelectedDays("");
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Icon name="Interface/Trash_Empty" size={36} style={{ color: "#c9c2ce" }} />
        <p className="text-sm font-medium text-neutral-600">Recycle Bin is empty.</p>
        <p className="max-w-xs text-xs text-neutral-400">Documents deleted by an Admin or Super Admin show up here and can be recovered.</p>
      </div>
    );
  }

  return (
    <div className="px-6 pb-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative max-w-xs flex-1">
          <Icon
            name="Interface/Search_Magnifying_Glass"
            size={13}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find in Recycle Bin…"
            className="w-full rounded-md border border-neutral-200 bg-white py-1.5 pr-3 pl-8 text-xs text-neutral-700 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors"
          style={
            activeCount > 0
              ? { borderColor: "var(--brand-purple)", color: "var(--brand-purple)", background: "var(--brand-purple-tint)" }
              : { borderColor: "#e5e5e5", color: "#525252" }
          }
        >
          Filter{activeCount > 0 ? ` (${activeCount})` : ""}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Icon name="Interface/Trash_Empty" size={36} style={{ color: "#c9c2ce" }} />
          <p className="text-sm font-medium text-neutral-600">
            {query || activeCount > 0 ? "No deleted documents match these filters." : "Recycle Bin is empty."}
          </p>
        </div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-xs font-semibold text-neutral-500">
              <th className="py-3 pr-4 font-semibold">Name</th>
              <th className="py-3 pr-4 font-semibold">Tags</th>
              <th className="w-40 py-3 pr-4 font-semibold">Deleted by</th>
              <th className="w-28 py-3 pr-4 font-semibold">Deleted</th>
              <th className="w-28 py-3 font-normal" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((doc) => (
              <RecycleBinRow key={doc.id} doc={doc} />
            ))}
          </tbody>
        </table>
      )}

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

              <FilterSection title="Deleted">
                <div className="flex flex-col gap-1.5">
                  {DATE_PRESETS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm text-neutral-700">
                      <input
                        type="radio"
                        name="deleted-date-filter"
                        checked={selectedDays === opt.value}
                        onChange={() => setSelectedDays(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </FilterSection>

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

function RecycleBinRow({ doc }: { doc: DeletedDocumentSummary }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleRecover() {
    startTransition(async () => {
      const result = await recoverDocumentAction(doc.id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <tr className="border-b border-neutral-50 last:border-0">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <FileTypeIcon type={fileTypeOf(doc.title, doc.sourceType)} />
          <span className="font-medium text-neutral-800">{doc.title}</span>
        </div>
      </td>
      <td className="py-3 pr-4">
        <div className="flex flex-wrap gap-1.5">
          {doc.ownerTeam && <Tag label={doc.ownerTeam.name} bg={TEAM_TAG_COLOR.bg} fg={TEAM_TAG_COLOR.fg} />}
          {doc.products.map((p) => (
            <Tag key={p.id} label={p.name} bg={PRODUCT_TAG_COLOR.bg} fg={PRODUCT_TAG_COLOR.fg} />
          ))}
          {dedupeGlobalCategories(doc.categories).map((c) => {
            const color = colorForCategory(c);
            return <Tag key={c.id} label={c.name} bg={color.bg} fg={color.fg} />;
          })}
        </div>
      </td>
      <td className="py-3 pr-4 text-neutral-500">{doc.deletedBy?.name ?? "—"}</td>
      <td className="py-3 pr-4 text-neutral-500" suppressHydrationWarning>
        {doc.deletedBy ? relativeTime(doc.deletedBy.at) : "—"}
      </td>
      <td className="py-3">
        <button
          type="button"
          onClick={handleRecover}
          disabled={isPending}
          className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-60"
        >
          {isPending ? "Recovering…" : "Recover"}
        </button>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Category, DocStatus } from "@/lib/api";
import { FILE_TYPE_LABEL, type FileTypeKey } from "@/lib/file-type";
import { FileTypeIcon } from "@/components/dashboard/FileTypeIcon";
import { colorForCategory } from "@/lib/tag-colors";

// No standalone "Published" option — leaving status unset already resolves
// to status=PUBLISHED server-side (see documents.ts), so it'd be a second
// radio button doing the exact same thing as "All (published)".
const STATUS_OPTIONS: { value: DocStatus | ""; label: string }[] = [
  { value: "", label: "All (published)" },
  { value: "PENDING", label: "Pending" },
  { value: "REJECTED", label: "Rejected" },
];

const DATE_PRESETS: { value: string; label: string }[] = [
  { value: "", label: "Any time" },
  { value: "1", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
];

const TYPE_OPTIONS: FileTypeKey[] = ["word", "excel", "powerpoint", "pdf", "image", "link", "other"];

export function FilterPanel({
  baseHref,
  categories,
  categoryCounts,
  status,
  modifiedSince,
  type,
  category,
}: {
  baseHref: string;
  categories: Category[];
  categoryCounts?: Record<string, number>;
  status?: string;
  modifiedSince?: string;
  type?: string;
  category?: string;
}) {
  const [open, setOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState("");
  const router = useRouter();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const activeTypes = type ? type.split(",").filter(Boolean) : [];
  const activeCategories = category ? category.split(",").filter(Boolean) : [];
  const activeDays = modifiedSince ? daysFromIso(modifiedSince) : "";

  const activeCount =
    (status ? 1 : 0) + (modifiedSince ? 1 : 0) + activeTypes.length + activeCategories.length;

  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(tagSearch.trim().toLowerCase()),
  );

  // Every control below applies immediately (no separate Apply step).
  // baseHref is the identity URL (mode/entity/view/folder) — it deliberately
  // does NOT carry status/modifiedSince/type (see DocumentsPanel's
  // identityHref), so those three are always re-written here from this
  // panel's own current props rather than trusted to already be on baseHref;
  // otherwise toggling one would silently erase the other two. category is
  // the opposite: left untouched unless its own handler fires, since while
  // inside a folder it's nav state baked into baseHref, not something this
  // panel owns (see DocumentsPanel's filterCategoryId) — rewriting it from
  // this panel's own (often-empty) idea of it used to kick you out of
  // whatever folder you were standing in the moment you touched any other filter.
  function push(next: { status?: string; days?: string; types?: string[]; categories?: string[] }) {
    const url = new URL(baseHref, "http://placeholder");

    const nextStatus = next.status ?? status ?? "";
    if (nextStatus) url.searchParams.set("status", nextStatus);
    else url.searchParams.delete("status");

    const nextDays = next.days ?? activeDays;
    if (nextDays) {
      url.searchParams.set("modifiedSince", new Date(Date.now() - Number(nextDays) * 86400000).toISOString());
    } else {
      url.searchParams.delete("modifiedSince");
    }

    const nextTypes = next.types ?? activeTypes;
    if (nextTypes.length) url.searchParams.set("type", nextTypes.join(","));
    else url.searchParams.delete("type");

    if (next.categories) {
      if (next.categories.length) url.searchParams.set("category", next.categories.join(","));
      else url.searchParams.delete("category");
      // Checking a Tag box in folder view produces the exact same URL shape
      // as clicking a folder tile (a single category id) — DocumentsPanel
      // can't tell those apart, so it read a checked Tag box as "you
      // navigated into this folder" and immediately hid it from this panel's
      // own props again (filterCategoryId), making the checkbox look like it
      // never checked at all. Forcing list view here makes "filter by tag"
      // unambiguous — folder drilling stays a FolderGrid-tile-only gesture.
      url.searchParams.set("view", "list");
    }

    router.push(`${url.pathname}${url.search}`);
  }

  function setStatus(value: string) {
    push({ status: value });
  }

  function setDays(days: string) {
    push({ days });
  }

  function toggleType(t: string) {
    push({ types: activeTypes.includes(t) ? activeTypes.filter((v) => v !== t) : [...activeTypes, t] });
  }

  function toggleCategory(id: string) {
    push({ categories: activeCategories.includes(id) ? activeCategories.filter((v) => v !== id) : [...activeCategories, id] });
  }

  function clear() {
    const url = new URL(baseHref, "http://placeholder");
    url.searchParams.delete("status");
    url.searchParams.delete("modifiedSince");
    url.searchParams.delete("type");
    url.searchParams.delete("category");
    router.push(`${url.pathname}${url.search}`);
    setOpen(false);
  }

  return (
    <>
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
              <FilterSection title="Status">
                <div className="flex flex-col gap-1.5">
                  {STATUS_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm text-neutral-700">
                      <input
                        type="radio"
                        name="status-filter"
                        checked={(status ?? "") === opt.value}
                        onChange={() => setStatus(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </FilterSection>

              <FilterSection title="Modified">
                <div className="flex flex-col gap-1.5">
                  {DATE_PRESETS.map((opt) => (
                    <label key={opt.value} className="flex items-center gap-2 text-sm text-neutral-700">
                      <input
                        type="radio"
                        name="date-filter"
                        checked={activeDays === opt.value}
                        onChange={() => setDays(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </FilterSection>

              <FilterSection title={`Type${activeTypes.length ? ` (${activeTypes.length})` : ""}`}>
                <div className="flex flex-col gap-1.5">
                  {TYPE_OPTIONS.map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm text-neutral-700">
                      <input
                        type="checkbox"
                        checked={activeTypes.includes(t)}
                        onChange={() => toggleType(t)}
                      />
                      <FileTypeIcon type={t} />
                      {FILE_TYPE_LABEL[t]}
                    </label>
                  ))}
                </div>
              </FilterSection>

              {categories.length > 0 && (
                <FilterSection
                  title={`Tags${activeCategories.length ? ` (${activeCategories.length})` : ""}`}
                  last
                >
                  <input
                    type="text"
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    placeholder="Search tags…"
                    className="mb-2 w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-700 outline-none focus:border-neutral-400"
                  />
                  {filteredCategories.length === 0 && (
                    <p className="py-1 text-xs text-neutral-400">No tags match &ldquo;{tagSearch}&rdquo;.</p>
                  )}
                  <div className="flex flex-col gap-1.5">
                    {filteredCategories.map((c) => {
                      const color = colorForCategory(c);
                      const count = categoryCounts?.[c.id] ?? 0;
                      return (
                        <label
                          key={c.id}
                          className="flex items-center justify-between gap-2 text-sm text-neutral-700"
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={activeCategories.includes(c.id)}
                              onChange={() => toggleCategory(c.id)}
                            />
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ background: color.fg }}
                              aria-hidden
                            />
                            {c.name}
                          </span>
                          <span className="text-xs text-neutral-400">{count}</span>
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
    </>
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

function daysFromIso(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 1) return "1";
  if (days <= 7) return "7";
  if (days <= 30) return "30";
  return "";
}

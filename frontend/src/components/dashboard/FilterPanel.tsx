"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Category, DocStatus } from "@/lib/api";
import { FILE_TYPE_LABEL, type FileTypeKey } from "@/lib/file-type";
import { FileTypeIcon } from "@/components/dashboard/FileTypeIcon";
import { colorForCategory } from "@/lib/tag-colors";
import { FilterSection } from "@/components/dashboard/FilterSection";
import { FilterTriggerButton } from "@/components/dashboard/FilterTriggerButton";
import { FilterDrawerHeader } from "@/components/dashboard/FilterDrawerHeader";
import { FilterDrawer } from "@/components/dashboard/FilterDrawer";
import { ModifiedDateSlider } from "@/components/dashboard/ModifiedDateSlider";
import { UploaderFilterSection, type UploaderOption } from "@/components/dashboard/UploaderFilterSection";
import { GroupedTagSection, type TagGroup, type TagSuperGroup } from "@/components/dashboard/GroupedTagSection";

// No standalone "Published" option — leaving status unset already resolves
// to status=PUBLISHED server-side (see documents.ts), so it'd be a second
// radio button doing the exact same thing as "All (published)".
const STATUS_OPTIONS: { value: DocStatus | ""; label: string }[] = [
  { value: "", label: "All (published)" },
  { value: "PENDING", label: "Pending" },
  { value: "REJECTED", label: "Rejected" },
];

const TYPE_OPTIONS: FileTypeKey[] = ["word", "excel", "powerpoint", "pdf", "image", "link", "other"];

export function FilterPanel({
  baseHref,
  categories,
  categoryCounts,
  status,
  modifiedSince,
  uploadedBy,
  type,
  category,
  uploaders,
  categoryGroups,
  categorySuperGroups,
}: {
  baseHref: string;
  categories: Category[];
  categoryCounts?: Record<string, number>;
  status?: string;
  modifiedSince?: string;
  uploadedBy?: string;
  type?: string;
  category?: string;
  uploaders?: UploaderOption[];
  categoryGroups?: TagGroup[];
  categorySuperGroups?: TagSuperGroup[];
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
  const activeUploaders = uploadedBy ? uploadedBy.split(",").filter(Boolean) : [];
  const activeDays = modifiedSince ? daysFromIso(modifiedSince) : "";

  const activeCount =
    (status ? 1 : 0) + (modifiedSince ? 1 : 0) + activeTypes.length + activeCategories.length + activeUploaders.length;

  const filteredCategories = categories.filter((c) =>
    c.name.toLowerCase().includes(tagSearch.trim().toLowerCase()),
  );

  // Every control below applies immediately (no separate Apply step).
  // baseHref is the identity URL (mode/entity/view/folder) — it deliberately
  // does NOT carry status/modifiedSince/type/uploadedBy (see DocumentsPanel's
  // identityHref), so those are always re-written here from this panel's own
  // current props rather than trusted to already be on baseHref; otherwise
  // toggling one would silently erase the others. category is the opposite:
  // left untouched unless its own handler fires, since while inside a folder
  // it's nav state baked into baseHref, not something this panel owns (see
  // DocumentsPanel's filterCategoryId) — rewriting it from this panel's own
  // (often-empty) idea of it used to kick you out of whatever folder you
  // were standing in the moment you touched any other filter.
  function push(next: { status?: string; days?: string; types?: string[]; categories?: string[]; uploadedBy?: string[] }) {
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

    const nextUploaders = next.uploadedBy ?? activeUploaders;
    if (nextUploaders.length) url.searchParams.set("uploadedBy", nextUploaders.join(","));
    else url.searchParams.delete("uploadedBy");

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

  function toggleUploader(id: string) {
    push({ uploadedBy: activeUploaders.includes(id) ? activeUploaders.filter((v) => v !== id) : [...activeUploaders, id] });
  }

  function clear() {
    const url = new URL(baseHref, "http://placeholder");
    url.searchParams.delete("status");
    url.searchParams.delete("modifiedSince");
    url.searchParams.delete("type");
    url.searchParams.delete("category");
    url.searchParams.delete("uploadedBy");
    router.push(`${url.pathname}${url.search}`);
    setOpen(false);
  }

  return (
    <>
      <FilterTriggerButton activeCount={activeCount} onClick={() => setOpen(true)} />

      <FilterDrawer open={open} onClose={() => setOpen(false)}>
        <FilterDrawerHeader onClose={() => setOpen(false)} onClear={clear} showClear={activeCount > 0} />

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
                <ModifiedDateSlider value={activeDays} onChange={setDays} />
              </FilterSection>

              {uploaders && uploaders.length > 0 && (
                <FilterSection title={`Modified By${activeUploaders.length ? ` (${activeUploaders.length})` : ""}`}>
                  <UploaderFilterSection uploaders={uploaders} selected={activeUploaders} onToggle={toggleUploader} />
                </FilterSection>
              )}

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

              {categoryGroups !== undefined ? (
                (categoryGroups.length > 0 || (categorySuperGroups?.length ?? 0) > 0) && (
                  <FilterSection
                    title={`Tags${activeCategories.length ? ` (${activeCategories.length})` : ""}`}
                    last
                  >
                    <GroupedTagSection
                      groups={categoryGroups}
                      superGroups={categorySuperGroups}
                      selected={activeCategories}
                      onToggle={toggleCategory}
                      counts={categoryCounts}
                    />
                  </FilterSection>
                )
              ) : (
                categories.length > 0 && (
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
                )
              )}
        </div>
      </FilterDrawer>
    </>
  );
}

function daysFromIso(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 1) return "1";
  if (days <= 7) return "7";
  if (days <= 30) return "30";
  if (days <= 90) return "90";
  if (days <= 365) return "365";
  return "";
}

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Category, DocStatus } from "@/lib/api";
import { FILE_TYPE_LABEL, type FileTypeKey } from "@/lib/file-type";
import { FileTypeIcon } from "@/components/dashboard/FileTypeIcon";
import { colorForScope } from "@/lib/tag-colors";

const STATUS_OPTIONS: { value: DocStatus | ""; label: string }[] = [
  { value: "", label: "All (published)" },
  { value: "PUBLISHED", label: "Published" },
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
  const [pendingStatus, setPendingStatus] = useState(status ?? "");
  const [pendingDays, setPendingDays] = useState(modifiedSince ? daysFromIso(modifiedSince) : "");
  const [pendingTypes, setPendingTypes] = useState<string[]>(type ? type.split(",").filter(Boolean) : []);
  const [pendingCategories, setPendingCategories] = useState<string[]>(
    category ? category.split(",").filter(Boolean) : [],
  );
  const router = useRouter();

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const activeCount =
    (status ? 1 : 0) + (modifiedSince ? 1 : 0) + (type ? type.split(",").filter(Boolean).length : 0) +
    (category ? category.split(",").filter(Boolean).length : 0);

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function apply() {
    const url = new URL(baseHref, "http://placeholder");
    if (pendingStatus) url.searchParams.set("status", pendingStatus);
    else url.searchParams.delete("status");

    if (pendingDays) {
      url.searchParams.set("modifiedSince", new Date(Date.now() - Number(pendingDays) * 86400000).toISOString());
    } else {
      url.searchParams.delete("modifiedSince");
    }

    if (pendingTypes.length) url.searchParams.set("type", pendingTypes.join(","));
    else url.searchParams.delete("type");

    if (pendingCategories.length) url.searchParams.set("category", pendingCategories.join(","));
    else url.searchParams.delete("category");

    router.push(`${url.pathname}${url.search}`);
    setOpen(false);
  }

  function clear() {
    setPendingStatus("");
    setPendingDays("");
    setPendingTypes([]);
    setPendingCategories([]);
    router.push(baseHref);
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
                        checked={pendingStatus === opt.value}
                        onChange={() => setPendingStatus(opt.value)}
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
                        checked={pendingDays === opt.value}
                        onChange={() => setPendingDays(opt.value)}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </FilterSection>

              <FilterSection title={`Type${pendingTypes.length ? ` (${pendingTypes.length})` : ""}`}>
                <div className="flex flex-col gap-1.5">
                  {TYPE_OPTIONS.map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm text-neutral-700">
                      <input
                        type="checkbox"
                        checked={pendingTypes.includes(t)}
                        onChange={() => toggle(pendingTypes, setPendingTypes, t)}
                      />
                      <FileTypeIcon type={t} />
                      {FILE_TYPE_LABEL[t]}
                    </label>
                  ))}
                </div>
              </FilterSection>

              {categories.length > 0 && (
                <FilterSection
                  title={`Tags${pendingCategories.length ? ` (${pendingCategories.length})` : ""}`}
                  last
                >
                  <div className="flex flex-col gap-1.5">
                    {categories.map((c) => {
                      const color = colorForScope(c.scope);
                      const count = categoryCounts?.[c.id] ?? 0;
                      return (
                        <label
                          key={c.id}
                          className="flex items-center justify-between gap-2 text-sm text-neutral-700"
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={pendingCategories.includes(c.id)}
                              onChange={() => toggle(pendingCategories, setPendingCategories, c.id)}
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

            <div className="flex gap-2 border-t border-neutral-100 px-5 py-4">
              <button
                type="button"
                onClick={apply}
                className="flex-1 rounded-md py-2 text-sm font-semibold text-white"
                style={{ background: "var(--brand-purple)" }}
              >
                Apply
              </button>
              <button
                type="button"
                onClick={clear}
                className="flex-1 rounded-md border border-neutral-200 py-2 text-sm font-medium text-neutral-600"
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

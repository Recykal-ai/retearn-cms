import Link from "next/link";
import type { Category } from "@/lib/api";
import { FILE_TYPE_LABEL, type FileTypeKey } from "@/lib/file-type";
import { colorForCategory } from "@/lib/tag-colors";
import type { UploaderOption } from "@/components/dashboard/UploaderFilterSection";

function withoutParam(baseHref: string, key: string, value?: string): string {
  const url = new URL(baseHref, "http://placeholder");
  if (value === undefined) {
    url.searchParams.delete(key);
  } else {
    const remaining = (url.searchParams.get(key) ?? "")
      .split(",")
      .filter((v) => v && v !== value);
    if (remaining.length) url.searchParams.set(key, remaining.join(","));
    else url.searchParams.delete(key);
  }
  return `${url.pathname}${url.search}`;
}

function daysLabel(iso: string): string {
  const days = Math.round((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 1) return "Modified today";
  if (days <= 7) return "Modified in last 7 days";
  if (days <= 30) return "Modified in last 30 days";
  return "Modified since " + new Date(iso).toLocaleDateString();
}

export function AppliedFilters({
  baseHref,
  clearHref,
  status,
  modifiedSince,
  uploadedBy,
  type,
  category,
  categories,
  uploaders,
}: {
  // Must already contain the CURRENT status/modifiedSince/type/category/
  // uploadedBy values (plus view/folder, if any) — each chip's "×" removes
  // just its own value via withoutParam, which only works if baseHref
  // carries the sibling values to preserve. A bare identity URL here would
  // silently wipe an entire multi-select filter (e.g. all Types) when
  // removing just one.
  baseHref: string;
  // Where "Clear all" goes — the identity URL with no filters, but still
  // preserving view mode/folder. Falls back to baseHref if omitted.
  clearHref?: string;
  status?: string;
  modifiedSince?: string;
  uploadedBy?: string;
  type?: string;
  category?: string;
  categories: Category[];
  uploaders?: UploaderOption[];
}) {
  const types = type ? type.split(",").filter(Boolean) : [];
  const categoryIds = category ? category.split(",").filter(Boolean) : [];
  const uploaderIds = uploadedBy ? uploadedBy.split(",").filter(Boolean) : [];
  const chips: { key: string; label: string; href: string; bg: string; fg: string }[] = [];

  if (status) {
    chips.push({
      key: "status",
      label: status.charAt(0) + status.slice(1).toLowerCase(),
      href: withoutParam(baseHref, "status"),
      bg: "var(--chip-neutral-bg)",
      fg: "var(--chip-neutral-fg)",
    });
  }
  if (modifiedSince) {
    chips.push({
      key: "modifiedSince",
      label: daysLabel(modifiedSince),
      href: withoutParam(baseHref, "modifiedSince"),
      bg: "var(--chip-neutral-bg)",
      fg: "var(--chip-neutral-fg)",
    });
  }
  for (const t of types) {
    chips.push({
      key: `type-${t}`,
      label: FILE_TYPE_LABEL[t as FileTypeKey] ?? t,
      href: withoutParam(baseHref, "type", t),
      bg: "var(--chip-neutral-bg)",
      fg: "var(--chip-neutral-fg)",
    });
  }
  for (const id of categoryIds) {
    const cat = categories.find((c) => c.id === id);
    if (!cat) continue;
    const color = colorForCategory(cat);
    chips.push({ key: `category-${id}`, label: cat.name, href: withoutParam(baseHref, "category", id), bg: color.bg, fg: color.fg });
  }
  for (const id of uploaderIds) {
    const uploader = uploaders?.find((u) => u.id === id);
    if (!uploader) continue;
    chips.push({
      key: `uploadedBy-${id}`,
      label: uploader.name,
      href: withoutParam(baseHref, "uploadedBy", id),
      bg: "var(--chip-neutral-bg)",
      fg: "var(--chip-neutral-fg)",
    });
  }

  if (chips.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-2 border-b border-neutral-100 px-6 py-3 dark:border-neutral-800"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      <span className="text-xs font-medium text-neutral-400 dark:text-neutral-500">Filtered by:</span>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-opacity hover:opacity-75"
          style={{ background: chip.bg, color: chip.fg }}
        >
          {chip.label}
          <span aria-hidden>×</span>
        </Link>
      ))}
      <Link href={clearHref ?? baseHref} className="text-xs font-medium underline" style={{ color: "var(--brand-purple)" }}>
        Clear all
      </Link>
    </div>
  );
}

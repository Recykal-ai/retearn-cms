"use client";

import { useRef } from "react";
import Link from "next/link";
import { Icon } from "@/components/dashboard/Icon";

const VIEWS = [
  { value: "list", label: "List" },
  { value: "tabs", label: "Tabs" },
  { value: "folders", label: "Folders" },
] as const;

export type ViewMode = (typeof VIEWS)[number]["value"];

export function ViewSwitcher({
  baseHref,
  view,
  hideFolders,
}: {
  baseHref: string;
  view: ViewMode;
  // True while a single category is the current location (a folder tile
  // click, or the equivalent single-category filter — see DocumentsPanel's
  // own selectedCategory). Categories are flat, so "Folders" has nothing to
  // show once inside one — offering it anyway was what silently bounced you
  // back out to the top-level folder grid on click, discarding exactly
  // where you were. Dropped from the list entirely rather than shown
  // disabled — a struck-through/greyed option users can't act on is its own
  // kind of confusing.
  hideFolders?: boolean;
}) {
  const visibleViews = hideFolders ? VIEWS.filter((v) => v.value !== "folders") : VIEWS;
  const current = VIEWS.find((v) => v.value === view) ?? VIEWS[0];
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Folder view's category is chosen by clicking a folder tile, not the
  // filter panel — carrying over an existing `category` filter into folder
  // view used to silently drop you into the flat list instead of the folder
  // grid, with no indication the view even changed.
  //
  // `view` is always set explicitly (never omitted/deleted) — folders is the
  // default when the param is absent (see dashboard/page.tsx), so dropping
  // the param here to mean "list" would silently land back on folders instead.
  function hrefFor(target: ViewMode): string {
    const url = new URL(baseHref, "http://placeholder");
    if (target === "folders") url.searchParams.delete("category");
    url.searchParams.set("view", target);
    return `${url.pathname}${url.search}`;
  }

  return (
    <details ref={detailsRef} className="group relative">
      <summary
        title={`View: ${current.label}`}
        className="flex cursor-pointer list-none items-center gap-0.5 rounded-md border border-neutral-200 px-1.5 py-1 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        <ViewIcon view={current.value} />
        <Icon name="Arrow/Chevron_Down" size={10} />
      </summary>
      <div
        className="absolute top-8 left-0 z-20 w-32 rounded-md border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {visibleViews.map((v) => (
          <Link
            key={v.value}
            href={hrefFor(v.value)}
            onClick={() => {
              if (detailsRef.current) detailsRef.current.open = false;
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
            style={v.value === view ? { color: "var(--brand-purple)", fontWeight: 600 } : undefined}
          >
            <ViewIcon view={v.value} />
            {v.label}
          </Link>
        ))}
      </div>
    </details>
  );
}

function ViewIcon({ view }: { view: ViewMode }) {
  if (view === "tabs") return <Icon name="Menu/More_Grid_Small" size={13} />;
  if (view === "folders") return <Icon name="File/Folder" size={13} />;
  return <Icon name="Menu/Hamburger_MD" size={13} />;
}

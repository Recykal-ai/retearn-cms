"use client";

import { useRef } from "react";
import Link from "next/link";

const VIEWS = [
  { value: "list", label: "List" },
  { value: "tabs", label: "Tabs" },
  { value: "folders", label: "Folders" },
] as const;

export type ViewMode = (typeof VIEWS)[number]["value"];

export function ViewSwitcher({ baseHref, view }: { baseHref: string; view: ViewMode }) {
  const current = VIEWS.find((v) => v.value === view) ?? VIEWS[0];
  const detailsRef = useRef<HTMLDetailsElement>(null);

  // Folder view's category is chosen by clicking a folder tile, not the
  // filter panel — carrying over an existing `category` filter into folder
  // view used to silently drop you into the flat list instead of the folder
  // grid, with no indication the view even changed.
  function hrefFor(target: ViewMode): string {
    const url = new URL(baseHref, "http://placeholder");
    if (target === "folders") url.searchParams.delete("category");
    if (target === "list") url.searchParams.delete("view");
    else url.searchParams.set("view", target);
    return `${url.pathname}${url.search}`;
  }

  return (
    <details ref={detailsRef} className="group relative">
      <summary
        title={`View: ${current.label}`}
        className="flex cursor-pointer list-none items-center gap-0.5 rounded-md border border-neutral-200 px-1.5 py-1 text-neutral-600 hover:bg-neutral-50"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        <ViewIcon view={current.value} />
        <ChevronIcon />
      </summary>
      <div
        className="absolute top-8 left-0 z-20 w-32 rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {VIEWS.map((v) => (
          <Link
            key={v.value}
            href={hrefFor(v.value)}
            onClick={() => {
              if (detailsRef.current) detailsRef.current.open = false;
            }}
            className="flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-700 hover:bg-neutral-50"
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
  if (view === "tabs") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
        <rect x="3" y="4" width="8" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <rect x="13" y="4" width="8" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <rect x="3" y="13" width="8" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
        <rect x="13" y="13" width="8" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (view === "folders") {
    return (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-9Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

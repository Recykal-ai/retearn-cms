"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/dashboard/Icon";
import { ICON_MANIFEST } from "@/lib/icon-manifest";

const POPOVER_WIDTH = 288; // px — matches the popover's own w-72

// A small trigger (the current icon, or a placeholder) that opens a
// searchable grid of the coolicons-style line-icon pack (public/icons/, see
// lib/icon-manifest.ts) — used for notes and folders in both
// NoteFolderTree.tsx rows and the note editors' headers. `icon` is one of
// the manifest's "Category/Name" identifiers, not an emoji — replaced the
// earlier emoji-picker-react version wholesale (not just re-skinned): that
// one rendered through each OS's own emoji font, which silently produced a
// broken glyph for some multi-codepoint emoji (Windows' Segoe UI Emoji in
// particular) with no reliable per-emoji way to detect or avoid it up
// front. A bundled, self-hosted SVG set sidesteps the whole class of bug —
// every icon renders the same way everywhere, because it's the same file.
export function IconPickerButton({
  icon,
  fallback,
  onSelect,
  onClear,
  size = "md",
  label,
}: {
  icon: string | null | undefined;
  fallback: React.ReactNode;
  onSelect: (icon: string) => void;
  onClear?: () => void;
  size?: "sm" | "md" | "lg";
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Position is computed from the trigger's viewport rect and the popover is
  // portaled to <body>, rendered with `fixed` coordinates — not just
  // `absolute` under the trigger. A plain absolute popover is clipped by any
  // scrollable ancestor whose overflow-x has been implicitly promoted from
  // `visible` to `auto` (which is what happens the moment overflow-y is set
  // to anything but visible — a CSS quirk, not a Tailwind bug). The sidebar's
  // notes tree is exactly that: `overflow-y-auto` on a `w-64` column, and
  // this popover is `w-72` — wider than the column — so it was getting
  // squashed/scrolled inside the sidebar instead of floating over it.
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Explicit focus instead of the `autoFocus` prop — the popover's DOM node
  // doesn't exist until the portal commits, and `autoFocus` racing that
  // (particularly a `fixed`-positioned node freshly appended to
  // document.body) has been unreliable enough elsewhere to not trust it
  // here; a rAF after mount guarantees the node is actually painted first.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node;
      if (popoverRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    }
    // Anchored by a snapshot of the trigger's position at open-time, not
    // tracked live — closing when an ANCESTOR scrolls (capture phase, so it
    // catches scroll on any scrollable ancestor, not just window) is simpler
    // than re-measuring on every scroll tick. Scroll events that originate
    // inside the popover itself (the icon grid's own overflow-y-auto, or the
    // browser auto-scrolling to reveal the autofocused search input) must be
    // ignored here, or the popover closes the instant you scroll the grid or
    // even just open it and the input autofocuses.
    function onScroll(e: Event) {
      if (popoverRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open]);

  const dims = size === "sm" ? "h-6 w-6" : size === "lg" ? "h-14 w-14" : "h-8 w-8";
  const glyphSize = size === "sm" ? 14 : size === "lg" ? 28 : 18;
  const showAsLabel = label && !icon;

  function openPicker() {
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - POPOVER_WIDTH - 8);
      const top = Math.min(rect.bottom + 4, window.innerHeight - 8);
      setCoords({ top, left });
    }
    setQuery("");
    setOpen(true);
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (open) setOpen(false);
          else openPicker();
        }}
        aria-label={icon ? "Change icon" : "Add icon"}
        title={icon ? "Change icon" : "Add icon"}
        className={
          showAsLabel
            ? "flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
            : `flex shrink-0 items-center justify-center overflow-hidden rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 ${dims}`
        }
      >
        {icon ? (
          <Icon name={icon} size={glyphSize} className="text-neutral-600 dark:text-neutral-400" />
        ) : showAsLabel ? (
          <>
            {fallback}
            {label}
          </>
        ) : (
          fallback
        )}
      </button>
      {open &&
        coords &&
        createPortal(
          <div
            ref={popoverRef}
            style={{ position: "fixed", top: coords.top, left: coords.left, width: POPOVER_WIDTH }}
            className="z-50 rounded-lg border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="border-b border-neutral-100 p-2 dark:border-neutral-800">
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // Stopped for every key, not just Escape — a document- or
                // window-level keydown listener elsewhere in the app (e.g. a
                // future keyboard shortcut) bubbling up from here would
                // otherwise have a chance to act on keys meant for this
                // search box.
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape") setOpen(false);
                }}
                placeholder="Search icons…"
                // Explicit bg/text/caret color, not inherited — this input
                // is portaled straight to document.body (see the comment on
                // `coords` above), and relying on inherited color here was
                // producing input that worked (the value/filtering below is
                // live) but rendered invisible: typed text was there, just
                // not painted.
                className="w-full rounded-md border border-neutral-200 bg-white px-2.5 py-1.5 text-sm text-neutral-900 caret-neutral-900 focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200 dark:caret-neutral-100 dark:focus:border-neutral-500"
              />
            </div>
            <IconGrid
              query={query}
              onSelect={(name) => {
                onSelect(name);
                setOpen(false);
              }}
            />
            {icon && onClear && (
              <button
                type="button"
                onClick={() => {
                  onClear();
                  setOpen(false);
                }}
                className="block w-full rounded-b-lg border-t border-neutral-200 bg-white px-3 py-2 text-left text-xs font-medium text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800"
              >
                Remove icon
              </button>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}

// "Category/Snake_Case_Name" -> "Snake Case Name" for both display and search.
function displayName(iconId: string): string {
  const name = iconId.split("/")[1] ?? iconId;
  return name.replace(/_/g, " ");
}

function IconGrid({ query, onSelect }: { query: string; onSelect: (name: string) => void }) {
  const needle = query.trim().toLowerCase();

  const grouped = useMemo(() => {
    const matches = needle
      ? ICON_MANIFEST.filter((id) => displayName(id).toLowerCase().includes(needle))
      : ICON_MANIFEST;
    const byCategory = new Map<string, string[]>();
    for (const id of matches) {
      const category = id.split("/")[0] ?? "Other";
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category)!.push(id);
    }
    return [...byCategory.entries()];
  }, [needle]);

  if (grouped.length === 0) {
    return <p className="p-4 text-center text-xs text-neutral-400 dark:text-neutral-500">No icons match &ldquo;{query}&rdquo;.</p>;
  }

  return (
    <div className="max-h-72 overflow-y-auto p-2">
      {grouped.map(([category, ids]) => (
        <div key={category} className="mb-2">
          <p className="mb-1 px-1 text-[10px] font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-500">{category}</p>
          <div className="grid grid-cols-8 gap-0.5">
            {ids.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                title={displayName(id)}
                className="flex h-8 w-8 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700"
              >
                <Icon name={id} size={18} />
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

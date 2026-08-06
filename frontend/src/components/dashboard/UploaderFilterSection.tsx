import { useMemo, useState } from "react";

// Same initials pattern as SideRail.tsx's local helper — no shared util
// exists for this repo-wide, four-line convention, so it's duplicated here too.
function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export interface UploaderOption {
  id: string;
  name: string;
  email: string;
  count: number;
}

const DEFAULT_LIMIT = 5;

export function UploaderFilterSection({
  uploaders,
  selected,
  onToggle,
}: {
  uploaders: UploaderOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const byCount = useMemo(
    () => [...uploaders].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    [uploaders],
  );

  const filtered = q ? byCount.filter((u) => u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) : byCount;

  // Unfiltered view caps at the top 5 by doc count — but a person already
  // checked (e.g. picked via an earlier search) must stay visible, or
  // there'd be no way to see/uncheck them again without re-searching.
  const top = byCount.slice(0, DEFAULT_LIMIT);
  const pinnedSelected = byCount.filter((u) => selected.includes(u.id) && !top.some((t) => t.id === u.id));
  const visible = q ? filtered : [...pinnedSelected, ...top];

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search people…"
        className="mb-2 w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-700 outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:focus:border-neutral-600"
      />
      {visible.length === 0 && <p className="py-1 text-xs text-neutral-400 dark:text-neutral-500">No people match &ldquo;{search}&rdquo;.</p>}
      <div className="flex max-h-52 flex-col gap-1.5 overflow-y-auto">
        {visible.map((u) => (
          <label key={u.id} className="flex items-center justify-between gap-2 text-sm text-neutral-700 dark:text-neutral-300">
            <span className="flex min-w-0 items-center gap-2">
              <input type="checkbox" checked={selected.includes(u.id)} onChange={() => onToggle(u.id)} />
              <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white"
                style={{ background: "var(--brand-purple)" }}
                aria-hidden
              >
                {initials(u.name)}
              </span>
              <span className="truncate">{u.name}</span>
            </span>
            <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">{u.count}</span>
          </label>
        ))}
      </div>
      {!q && uploaders.length > DEFAULT_LIMIT && (
        <p className="mt-1.5 text-[11px] text-neutral-400 dark:text-neutral-500">
          Showing top {DEFAULT_LIMIT} of {uploaders.length} — search to find someone else.
        </p>
      )}
    </div>
  );
}

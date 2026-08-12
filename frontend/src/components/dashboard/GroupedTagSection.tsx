import { useState } from "react";
import { colorForCategory } from "@/lib/tag-colors";

// Dashboard's real Category (api.ts) satisfies this structurally as-is.
// Pinned/Recycle Bin filter by tag *name* (no stable per-scope id in their
// already-loaded, cross-scope document lists), so they synthesize `id: name`
// when building their own tag/group lists — this component doesn't care
// which scheme a caller uses, it just toggles whatever `id` it's given.
export interface GroupableCategory {
  id: string;
  name: string;
  scope: string;
  isGlobal?: boolean;
}

export interface TagGroup {
  key: string;
  label: string;
  categories: GroupableCategory[];
}

// One level up from TagGroup — "Team" containing an AI/Embedded/Marketing/…
// sub-group per team, "Product" containing an Ace/Fastscan/… sub-group per
// product. Keeps the two entity kinds visually separated instead of one
// long flat list of every team and product mixed together.
export interface TagSuperGroup {
  key: string;
  label: string;
  groups: TagGroup[];
}

// "Global tags" (passed via `groups`) is a flat entry rendered the same way
// as every Team/Product sub-group — every group, at any level, is the same
// collapsible <details> block, so the panel's height stays predictable
// regardless of how many tags or teams/products exist.
export function GroupedTagSection({
  groups,
  superGroups,
  selected,
  onToggle,
  counts,
  scopeColors,
}: {
  groups: TagGroup[];
  superGroups?: TagSuperGroup[];
  selected: string[];
  onToggle: (id: string) => void;
  counts?: Record<string, number>;
  scopeColors?: Record<string, { bg: string; fg: string }>;
}) {
  const [search, setSearch] = useState("");
  const q = search.trim().toLowerCase();

  const checkbox = (c: GroupableCategory) => {
    const color = colorForCategory(c, scopeColors);
    const count = counts?.[c.id] ?? 0;
    return (
      <label key={c.id} className="flex items-center justify-between gap-2 text-sm text-neutral-700 dark:text-neutral-300">
        <span className="flex min-w-0 items-center gap-2">
          <input type="checkbox" checked={selected.includes(c.id)} onChange={() => onToggle(c.id)} />
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color.fg }} aria-hidden />
          <span className="truncate">{c.name}</span>
        </span>
        <span className="shrink-0 text-xs text-neutral-400 dark:text-neutral-500">{count}</span>
      </label>
    );
  };

  const subGroup = (g: TagGroup) => {
    const hasChecked = g.categories.some((c) => selected.includes(c.id));
    return (
      <details key={g.key} open={hasChecked}>
        <summary className="cursor-pointer text-xs font-semibold text-neutral-500 select-none dark:text-neutral-400">{g.label}</summary>
        <div className="mt-1.5 flex flex-col gap-1.5 pl-2">{g.categories.map(checkbox)}</div>
      </details>
    );
  };

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search tags…"
        className="mb-2 w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm text-neutral-700 outline-none focus:border-neutral-400 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:focus:border-neutral-600"
      />

      {q ? (
        (() => {
          const flat = [...groups.flatMap((g) => g.categories), ...(superGroups ?? []).flatMap((sg) => sg.groups.flatMap((g) => g.categories))].filter(
            (c) => c.name.toLowerCase().includes(q),
          );
          return flat.length === 0 ? (
            <p className="py-1 text-xs text-neutral-400 dark:text-neutral-500">No tags match &ldquo;{search}&rdquo;.</p>
          ) : (
            <div className="flex flex-col gap-1.5">{flat.map(checkbox)}</div>
          );
        })()
      ) : (
        <div className="flex max-h-72 flex-col gap-3 overflow-y-auto">
          {groups.map(subGroup)}
          {(superGroups ?? []).map((sg) => {
            const hasChecked = sg.groups.some((g) => g.categories.some((c) => selected.includes(c.id)));
            return (
              <details key={sg.key} open={hasChecked}>
                <summary className="cursor-pointer text-xs font-semibold text-neutral-700 select-none dark:text-neutral-300">{sg.label}</summary>
                <div className="mt-1.5 flex flex-col gap-2 pl-2">{sg.groups.map(subGroup)}</div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

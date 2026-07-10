"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Team, Product, Category } from "@/lib/api";
import { createCategoryAction, deleteCategoryAction } from "@/app/dashboard/admin/admin-actions";
import { DeleteTagModal } from "@/components/dashboard/admin/DeleteTagModal";
import { useToast } from "@/components/ToastProvider";

type Mode = "team" | "product";

export function CategoriesSection({
  teams,
  products,
  categoriesByScope,
  viewerScope,
  isSuperAdmin,
}: {
  teams: Team[];
  products: Product[];
  categoriesByScope: Record<string, Category[]>;
  viewerScope: { teamIds: string[]; productIds: string[] } | null;
  isSuperAdmin: boolean;
}) {
  const [mode, setMode] = useState<Mode>("team");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const categoryFormRef = useRef<HTMLFormElement>(null);
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();

  function handleCreateCategory(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name");
    startTransition(async () => {
      try {
        await createCategoryAction(formData);
        show(`"${name}" added.`);
        const nameInput = categoryFormRef.current?.elements.namedItem("name");
        if (nameInput instanceof HTMLInputElement) nameInput.value = "";
      } catch (err) {
        show(err instanceof Error ? err.message : `Failed to add "${name}".`, "error");
      }
    });
  }

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // "Others" is a flat catch-all, not meant to grow its own category
  // taxonomy — anything filed under it already gets the per-scope "Others"
  // category automatically, so it's not offered here as somewhere to add more.
  const allEntities: (Team | Product)[] = (mode === "team" ? teams : products).filter((e) => e.name !== "Others");
  const entities = viewerScope
    ? allEntities.filter((e) => (mode === "team" ? viewerScope.teamIds : viewerScope.productIds).includes(e.id))
    : allEntities;
  const filtered = query.trim()
    ? entities.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()))
    : entities;
  // Only a Super Admin can create a category across every team and product
  // at once — even an unrestricted (unscoped) Admin only manages the teams/
  // products they were actually made admin of, so this option doesn't show
  // for any Admin tier, scoped or not.
  const showAllOption = isSuperAdmin && !query.trim();
  const isAllSelected = selectedId === "all";
  const selected = isAllSelected ? undefined : entities.find((e) => e.id === selectedId);
  const cats = selected ? (categoriesByScope[selected.id] ?? []) : [];

  function switchMode(next: Mode) {
    setMode(next);
    setSelectedId(null);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-semibold text-neutral-900">Category creation</h2>
      <p className="mb-4 text-xs text-neutral-400">
        Tags are scoped to a single team or product.
        {viewerScope ? " Showing only the teams/products you manage." : ""}
      </p>

      <div className="mb-5 flex items-center gap-3">
        <div className="inline-flex rounded-full bg-neutral-100 p-0.5 text-sm font-medium">
          <button
            type="button"
            onClick={() => switchMode("team")}
            className="rounded-full px-3 py-1 transition-colors"
            style={mode === "team" ? { background: "white", color: "#171717", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } : { color: "#737373" }}
          >
            Team
          </button>
          <button
            type="button"
            onClick={() => switchMode("product")}
            className="rounded-full px-3 py-1 transition-colors"
            style={mode === "product" ? { background: "white", color: "#171717", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } : { color: "#737373" }}
          >
            Product
          </button>
        </div>

        <div ref={dropdownRef} className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex min-w-48 items-center justify-between gap-2 rounded-md border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:border-neutral-400"
          >
            {isAllSelected ? "All (every team & product)" : selected ? selected.name : `Select a ${mode}…`}
            <ChevronIcon />
          </button>

          {open && (
            <div className="absolute top-full left-0 z-20 mt-1 w-64 rounded-md border border-neutral-200 bg-white p-2 shadow-lg">
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={`Search ${mode}s…`}
                className="mb-2 w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs text-neutral-700 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none"
              />
              <div className="max-h-48 space-y-0.5 overflow-y-auto">
                {showAllOption && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedId("all");
                      setOpen(false);
                      setQuery("");
                    }}
                    className="mb-0.5 block w-full rounded-md border-b border-neutral-100 px-2.5 py-1.5 text-left text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                  >
                    All (every team &amp; product)
                  </button>
                )}
                {filtered.map((e) => (
                  <button
                    key={e.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(e.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="block w-full rounded-md px-2.5 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    {e.name}
                  </button>
                ))}
                {filtered.length === 0 && !showAllOption && <p className="px-2.5 py-1.5 text-xs text-neutral-400">No matches.</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {isAllSelected ? (
        <div className="border-t border-neutral-100 pt-4">
          <p className="mb-3 text-xs text-neutral-500">
            Creates this tag under every team and product at once (except Others), so it shows up everywhere and
            merges into one filter chip on the dashboard&apos;s All home view. Anywhere it already exists is left as-is.
          </p>
          <form ref={categoryFormRef} onSubmit={handleCreateCategory} className="flex gap-2">
            <input type="hidden" name="scope" value="all" />
            <input
              name="name"
              placeholder="New global tag name"
              required
              disabled={isPending}
              className="max-w-xs flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-400 focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--brand-purple)" }}
            >
              {isPending ? "Adding…" : "Add"}
            </button>
          </form>
        </div>
      ) : selected ? (
        <div className="border-t border-neutral-100 pt-4">
          <p className="mb-2 text-xs font-semibold text-neutral-500">
            {mode === "team" ? "Team" : "Product"}: <span className="text-neutral-700">{selected.name}</span>
          </p>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {cats.map((c) => (
              <span
                key={c.id}
                className="group relative flex items-center gap-1 rounded-full bg-neutral-100 py-1 pr-1.5 pl-2.5 text-xs text-neutral-600"
              >
                {c.name}
                {c.name !== "Others" && (
                  <button
                    type="button"
                    onClick={() => setPendingDelete(c)}
                    aria-label={`Remove ${c.name}`}
                    className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-neutral-300 hover:text-neutral-700"
                  >
                    <XIcon />
                  </button>
                )}
              </span>
            ))}
            {cats.length === 0 && <span className="text-xs text-neutral-400">No tags yet.</span>}
          </div>
          <form ref={categoryFormRef} onSubmit={handleCreateCategory} className="flex gap-2">
            <input type="hidden" name="scope" value={selected.id} />
            <input
              name="name"
              placeholder="New tag name"
              required
              disabled={isPending}
              className="max-w-xs flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-400 focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={isPending}
              className="rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--brand-purple)" }}
            >
              {isPending ? "Adding…" : "Add"}
            </button>
          </form>
        </div>
      ) : (
        <p className="border-t border-neutral-100 pt-4 text-sm text-neutral-400">
          {entities.length === 0
            ? `No ${mode}s available.`
            : `Pick a ${mode} above to see and manage its tags.`}
        </p>
      )}

      {pendingDelete && (
        <DeleteTagModal
          label={pendingDelete.name}
          documentCount={pendingDelete.documentCount}
          onConfirm={() => deleteCategoryAction(pendingDelete.id)}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

function XIcon() {
  return (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "#a3a3a3" }}>
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import type { Team, Product } from "@/lib/api";

export function NavSidebar({
  mode,
  teams,
  products,
  selectedId,
}: {
  mode: "team" | "product" | "all";
  teams: Team[];
  products: Product[];
  selectedId?: string;
}) {
  const [query, setQuery] = useState("");

  const entities = mode === "team" ? teams : mode === "product" ? products : [];
  const filtered = query.trim()
    ? entities.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()))
    : entities;

  return (
    <div
      className="flex w-70 flex-shrink-0 flex-col border-r p-4"
      style={{ fontFamily: "var(--font-ui)", background: "var(--canvas)", borderColor: "var(--canvas-border)" }}
    >
      {/* Neither pill highlighted in "all" mode — that state isn't a third
          option to pick, it's just what you get before choosing Team or
          Product (or after clicking "Documents" in the breadcrumb to reset
          back to it). */}
      <div className="mb-4 flex rounded-full border border-neutral-300 bg-white p-0.5 text-sm font-medium">
        <Link
          // Clicking Team again while it's already selected deselects it —
          // same toggle-off pattern as an entity row below — dropping back
          // to bare "all" mode (neither pill highlighted, every document
          // visible) instead of being a no-op.
          href={mode === "team" ? "/dashboard" : "/dashboard?mode=team"}
          className="flex-1 rounded-full py-1.5 text-center transition-colors"
          style={
            mode === "team"
              ? { background: "var(--brand-purple)", color: "white" }
              : { color: "#737373" }
          }
        >
          Team
        </Link>
        <Link
          href={mode === "product" ? "/dashboard" : "/dashboard?mode=product"}
          className="flex-1 rounded-full py-1.5 text-center transition-colors"
          style={
            mode === "product"
              ? { background: "var(--brand-purple)", color: "white" }
              : { color: "#737373" }
          }
        >
          Product
        </Link>
      </div>

      {mode === "all" ? (
        <p className="px-1 text-sm text-neutral-500">
          Showing documents from every team and product. Switch to Team or Product above to browse one at a time.
        </p>
      ) : (
        <>
          <div className="relative mb-4">
            <SearchIcon className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find"
              className="w-full rounded-md border border-neutral-200 bg-white py-2 pr-3 pl-9 text-sm text-neutral-700 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none"
            />
          </div>

          <p className="mb-1 px-1 text-xs font-semibold tracking-wide text-neutral-400 uppercase">
            {mode === "team" ? "Teams" : "Products"}
          </p>

          <nav className="-mx-1 flex-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="px-2 py-2 text-sm text-neutral-400 italic">No matches</p>
            )}
            {filtered.map((entity) => {
              const isSelected = entity.id === selectedId;
              // Clicking the already-selected entity again deselects it
              // rather than being a no-op — drops back to "mode picked, no
              // entity narrowed", which (per page.tsx's isGlobal check)
              // shows every document again while staying on this Team/
              // Product tab, same as never having picked an entity at all.
              const href = isSelected ? `/dashboard?mode=${mode}` : `/dashboard?mode=${mode}&entity=${entity.id}`;
              return (
                <Link
                  key={entity.id}
                  href={href}
                  className="flex items-center justify-between rounded-md border-l-[3px] px-2.5 py-2 text-sm transition-colors"
                  style={
                    isSelected
                      ? {
                          background: "white",
                          borderColor: "var(--brand-purple)",
                          color: "var(--brand-purple)",
                          fontWeight: 600,
                          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                        }
                      : { borderColor: "transparent", color: "#404040" }
                  }
                >
                  <span className="truncate">{entity.name}</span>
                  <span
                    className="rounded-full px-2 py-0.5 text-xs font-medium"
                    style={
                      isSelected
                        ? { background: "var(--brand-purple-tint)", color: "var(--brand-purple)" }
                        : { background: "#f0eef1", color: "#8a8a8a" }
                    }
                  >
                    {entity.documentCount}
                  </span>
                </Link>
              );
            })}
          </nav>
        </>
      )}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

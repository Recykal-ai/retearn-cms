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
  mode: "team" | "product";
  teams: Team[];
  products: Product[];
  selectedId?: string;
}) {
  const [query, setQuery] = useState("");

  const entities = mode === "team" ? teams : products;
  const filtered = query.trim()
    ? entities.filter((e) => e.name.toLowerCase().includes(query.trim().toLowerCase()))
    : entities;

  return (
    <div
      className="flex w-70 flex-shrink-0 flex-col border-r p-4"
      style={{ fontFamily: "var(--font-ui)", background: "var(--canvas)", borderColor: "var(--canvas-border)" }}
    >
      <div className="mb-4 flex rounded-full border border-neutral-300 bg-white p-0.5 text-sm font-medium">
        <Link
          href="/dashboard?mode=team"
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
          href="/dashboard?mode=product"
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
          return (
            <Link
              key={entity.id}
              href={`/dashboard?mode=${mode}&entity=${entity.id}`}
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

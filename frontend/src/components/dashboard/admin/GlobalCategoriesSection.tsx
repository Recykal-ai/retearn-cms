"use client";

import { useState } from "react";
import type { GlobalCategorySummary } from "@/lib/api";
import { GLOBAL_TAG_COLOR } from "@/lib/tag-colors";
import { deleteGlobalCategoryAction } from "@/app/dashboard/admin/admin-actions";
import { DeleteTagModal } from "@/components/dashboard/admin/DeleteTagModal";

export function GlobalCategoriesSection({
  categories,
  isSuperAdmin,
}: {
  categories: GlobalCategorySummary[];
  isSuperAdmin: boolean;
}) {
  const [pendingDelete, setPendingDelete] = useState<GlobalCategorySummary | null>(null);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-semibold text-neutral-900">Global categories</h2>
      <p className="mb-4 text-xs text-neutral-400">
        Tags that span every team and product at once — shown in this reserved gold color everywhere they appear.
        {!isSuperAdmin && " Only a Super Admin can create or remove one."}
      </p>

      {categories.length === 0 ? (
        <p className="border-t border-neutral-100 pt-4 text-sm text-neutral-400">No global tags yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5 border-t border-neutral-100 pt-4">
          {categories.map((c) => (
            <span
              key={c.name}
              className="group relative flex items-center gap-1.5 rounded-full py-1 pr-1.5 pl-2.5 text-xs font-medium"
              style={{ background: GLOBAL_TAG_COLOR.bg, color: GLOBAL_TAG_COLOR.fg }}
            >
              {c.name}
              <span className="opacity-70">
                {c.documentCount} doc{c.documentCount === 1 ? "" : "s"} · {c.scopeCount} scopes
              </span>
              {isSuperAdmin && (
                <button
                  type="button"
                  onClick={() => setPendingDelete(c)}
                  aria-label={`Remove ${c.name}`}
                  className="flex h-3.5 w-3.5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 hover:bg-black/10"
                >
                  <XIcon />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {pendingDelete && (
        <DeleteTagModal
          label={pendingDelete.name}
          documentCount={pendingDelete.documentCount}
          onConfirm={() => deleteGlobalCategoryAction(pendingDelete.name)}
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

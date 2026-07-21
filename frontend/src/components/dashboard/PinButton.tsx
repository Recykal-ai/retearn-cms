"use client";

import { useState, useTransition } from "react";
import { setPinnedAction } from "@/app/dashboard/documents-actions";
import { Icon } from "@/components/dashboard/Icon";

export function PinButton({ documentId, pinned, size = 15 }: { documentId: string; pinned: boolean; size?: number }) {
  const [optimistic, setOptimistic] = useState(pinned);
  const [isPending, startTransition] = useTransition();

  function toggle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = !optimistic;
    setOptimistic(next);
    startTransition(async () => {
      const result = await setPinnedAction(documentId, next);
      if (result.error) setOptimistic(!next);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isPending}
      title={optimistic ? "Unpin" : "Pin"}
      aria-label={optimistic ? "Unpin this document" : "Pin this document"}
      aria-pressed={optimistic}
      className="shrink-0 text-neutral-300 hover:text-amber-500 disabled:opacity-60"
      style={optimistic ? { color: "#e0a419" } : undefined}
    >
      {/* The icon pack ships outline-only (fill="none") — `[&>svg]:fill-current`
          overrides that at CSS level (which wins over the SVG's own
          presentation attribute) to get the filled/unfilled pin states this
          button needs, without a second "filled star" asset. */}
      <Icon name="Interface/Star" size={size} className={optimistic ? "[&>svg]:fill-current" : undefined} />
    </button>
  );
}

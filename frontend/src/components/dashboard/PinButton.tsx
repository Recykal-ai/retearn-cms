"use client";

import { useState, useTransition } from "react";
import { setPinnedAction } from "@/app/dashboard/documents-actions";

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
      <StarIcon size={size} filled={optimistic} />
    </button>
  );
}

function StarIcon({ size, filled }: { size: number; filled: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill={filled ? "currentColor" : "none"}>
      <path
        d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

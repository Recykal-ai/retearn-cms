"use client";

import { useState, useTransition } from "react";

export function DeleteTagModal({
  label,
  documentCount,
  onConfirm,
  onClose,
}: {
  label: string;
  documentCount: number;
  onConfirm: () => Promise<{ error?: string }>;
  onClose: () => void;
}) {
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await onConfirm();
      if (result.error) {
        setError(result.error);
      } else {
        onClose();
      }
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      style={{ fontFamily: "var(--font-ui)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h1 className="mb-2 text-lg font-semibold text-neutral-900">Remove &ldquo;{label}&rdquo;?</h1>
        <p className="mb-5 text-sm text-neutral-500">
          {documentCount === 0
            ? "No documents are tagged with this right now."
            : `${documentCount} document${documentCount === 1 ? "" : "s"} ${
                documentCount === 1 ? "is" : "are"
              } tagged with this. They'll be moved to "Others" instead of losing the tag entirely.`}
        </p>
        {error && <p className="mb-3 text-xs font-medium text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "#b3342c" }}
          >
            {isPending ? "Removing…" : "Remove"}
          </button>
        </div>
      </div>
    </div>
  );
}

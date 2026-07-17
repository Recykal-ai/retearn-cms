"use client";

import { useState } from "react";
import { buildFolderOptions, type TreeFolder } from "@/components/dashboard/NoteFolderTree";
import { useToast } from "@/components/ToastProvider";

// Shared by both a note's "Move to…" and a folder's "Move to…" — the caller
// decides what "moving" means (folderId vs parentId) via onMove. For moving
// a folder, pass excludeSubtreeOf so the picker can't offer the folder
// itself or any of its own descendants as a target (that'd be a cycle).
export function MoveToFolderModal({
  title,
  folders,
  excludeSubtreeOf,
  currentFolderId,
  onClose,
  onMove,
}: {
  title: string;
  folders: TreeFolder[];
  excludeSubtreeOf?: string;
  currentFolderId: string | null;
  onClose: () => void;
  onMove: (targetFolderId: string | null) => Promise<{ error?: string }>;
}) {
  const [targetId, setTargetId] = useState(currentFolderId ?? "");
  const [moving, setMoving] = useState(false);
  const { show } = useToast();

  const options = buildFolderOptions(folders, excludeSubtreeOf);

  async function handleMove() {
    setMoving(true);
    const result = await onMove(targetId || null);
    setMoving(false);
    if (result.error) {
      show(result.error, "error");
      return;
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      style={{ fontFamily: "var(--font-ui)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-900">{title}</h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-xl leading-none text-neutral-400 hover:text-neutral-600"
          >
            ×
          </button>
        </div>

        <div className="mb-5">
          <label className="mb-1 block text-xs font-semibold text-neutral-500">Destination</label>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
          >
            <option value="">Root</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

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
            onClick={handleMove}
            disabled={moving}
            className="rounded-md px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--brand-purple)" }}
          >
            {moving ? "Moving…" : "Move"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState, useTransition } from "react";
import type { DocumentVersionEntry } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import { getDocumentVersionsAction, revertVersionAction } from "@/app/dashboard/documents-actions";
import { useDocumentViewer } from "@/components/dashboard/useDocumentViewer";
import { useToast } from "@/components/ToastProvider";

export function VersionHistoryModal({
  documentId,
  title,
  currentVersion: initialCurrentVersion,
  onClose,
}: {
  documentId: string;
  title: string;
  currentVersion: number;
  onClose: () => void;
}) {
  const [versions, setVersions] = useState<DocumentVersionEntry[] | null>(null);
  const [currentVersion, setCurrentVersion] = useState(initialCurrentVersion);
  const [error, setError] = useState("");
  const [confirmingVersion, setConfirmingVersion] = useState<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const { viewVersion, isOpening, viewerNode } = useDocumentViewer();
  const { show } = useToast();

  async function loadVersions() {
    try {
      const v = await getDocumentVersionsAction(documentId);
      setVersions(v);
      if (v.length > 0) setCurrentVersion(Math.max(...v.map((x) => x.version)));
    } catch {
      setError("Couldn't load version history.");
    }
  }

  useEffect(() => {
    let cancelled = false;
    getDocumentVersionsAction(documentId)
      .then((v) => {
        if (cancelled) return;
        setVersions(v);
        if (v.length > 0) setCurrentVersion(Math.max(...v.map((x) => x.version)));
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load version history.");
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  // Restoring an older (or, after restoring once, a newer) version pushes a
  // brand-new version row that copies that version's content — same
  // auto-publish-if-admin rule as any other version push, so a User's revert
  // still lands in Pending for review.
  function handleRevert(version: number) {
    startTransition(async () => {
      const result = await revertVersionAction(documentId, version);
      if (result.error) {
        show(result.error, "error");
        setConfirmingVersion(null);
        return;
      }
      show(
        result.status === "PENDING"
          ? `Reverted to version ${version} — awaiting approval.`
          : `Reverted to version ${version}.`,
      );
      setConfirmingVersion(null);
      await loadVersions();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      style={{ fontFamily: "var(--font-ui)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-900">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-200">Version history</h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-xl leading-none text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
          >
            ×
          </button>
        </div>
        <p className="mb-5 truncate text-xs text-neutral-400 dark:text-neutral-500">&ldquo;{title}&rdquo;</p>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {!error && versions === null && <p className="text-sm text-neutral-400 dark:text-neutral-500">Loading…</p>}
        {versions && versions.length === 0 && <p className="text-sm text-neutral-400 dark:text-neutral-500">No version history yet.</p>}

        {versions && versions.length > 0 && (
          <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
            {versions.map((v) => {
              const isCurrent = v.version === currentVersion;
              return (
                <li key={v.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
                      Version {v.version}
                      {isCurrent && (
                        <span
                          className="ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ background: "var(--brand-purple-tint)", color: "var(--brand-purple)" }}
                        >
                          Current
                        </span>
                      )}
                    </p>
                    {v.note && <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">{v.note}</p>}
                    <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500" suppressHydrationWarning>
                      {relativeTime(v.createdAt)}
                    </p>
                    {confirmingVersion === v.version && (
                      <div className="mt-2 flex items-center gap-2">
                        <span className="text-xs text-neutral-500 dark:text-neutral-400">Restore version {v.version}?</span>
                        <button
                          type="button"
                          onClick={() => handleRevert(v.version)}
                          disabled={isPending}
                          className="rounded-md px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
                          style={{ background: "var(--brand-purple)" }}
                        >
                          {isPending ? "Restoring…" : "Confirm"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingVersion(null)}
                          className="text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => viewVersion(documentId, v.version, v.s3Key?.split("/").pop() ?? title)}
                      disabled={isOpening(`${documentId}:${v.version}`)}
                      className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                    >
                      {isOpening(`${documentId}:${v.version}`) ? "Opening…" : "Open"}
                    </button>
                    {!isCurrent && (
                      <button
                        type="button"
                        onClick={() => setConfirmingVersion(v.version)}
                        disabled={isPending}
                        className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-60 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {viewerNode}
    </div>
  );
}

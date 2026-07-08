"use client";

import { useState, useTransition } from "react";
import type { DeletionRequestSummary } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import { approveDeletionAction, rejectDeletionAction } from "@/app/dashboard/documents-actions";
import { useDocumentViewer } from "@/components/dashboard/useDocumentViewer";
import { useToast } from "@/components/ToastProvider";

export function DeletionRequestsAdmin({ documents }: { documents: DeletionRequestSummary[] }) {
  const { view, viewerNode } = useDocumentViewer();
  const { show } = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleApprove(doc: DeletionRequestSummary) {
    setBusyId(doc.id);
    startTransition(async () => {
      const result = await approveDeletionAction(doc.id);
      show(result.error ?? `"${doc.title}" deleted.`, result.error ? "error" : "success");
      setBusyId(null);
    });
  }

  function handleReject(doc: DeletionRequestSummary) {
    setBusyId(doc.id);
    startTransition(async () => {
      const result = await rejectDeletionAction(doc.id);
      show(result.error ?? `Deletion request for "${doc.title}" dismissed.`, result.error ? "error" : "success");
      setBusyId(null);
    });
  }

  if (documents.length === 0) {
    return <p className="py-16 text-center text-sm text-neutral-400">No deletion requests waiting on review.</p>;
  }

  return (
    <div className="px-6">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-100 text-xs font-semibold text-neutral-500">
            <th className="py-3">Name</th>
            <th className="w-32 py-3">Team</th>
            <th className="py-3">Reason</th>
            <th className="w-40 py-3">Requested</th>
            <th className="w-44 py-3">Requested by</th>
            <th className="w-44 py-3" />
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id} className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50/60">
              <td className="py-3 pr-4 font-medium text-neutral-800">
                <button type="button" onClick={() => view(doc)} className="text-left hover:underline">
                  {doc.title}
                </button>
              </td>
              <td className="py-3 text-neutral-500">
                {doc.ownerTeam?.name ?? (doc.products.map((p) => p.name).join(", ") || "—")}
              </td>
              <td className="py-3 text-neutral-500">
                {doc.deletionRequestNote ? (
                  <span className="italic">&ldquo;{doc.deletionRequestNote}&rdquo;</span>
                ) : (
                  <span className="text-neutral-300">No reason given</span>
                )}
              </td>
              <td className="py-3 text-neutral-500" suppressHydrationWarning>
                {doc.deletionRequestedAt ? relativeTime(doc.deletionRequestedAt) : "—"}
              </td>
              <td className="py-3 text-neutral-500">{doc.deletionRequestedBy?.name ?? "—"}</td>
              <td className="py-3">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => handleReject(doc)}
                    disabled={isPending && busyId === doc.id}
                    className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-60"
                  >
                    Keep
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApprove(doc)}
                    disabled={isPending && busyId === doc.id}
                    className="rounded-md px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-60"
                    style={{ background: "#b3342c" }}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {viewerNode}
    </div>
  );
}

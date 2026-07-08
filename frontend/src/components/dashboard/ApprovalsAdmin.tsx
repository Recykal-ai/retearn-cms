"use client";

import { useState, useTransition } from "react";
import type { DocumentSummary } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import { approveDocumentsAction, rejectDocumentsAction } from "@/app/dashboard/documents-actions";
import { useDocumentViewer } from "@/components/dashboard/useDocumentViewer";
import { useToast } from "@/components/ToastProvider";

export function ApprovalsAdmin({ documents }: { documents: DocumentSummary[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectNoteOpen, setRejectNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const { view, viewerNode } = useDocumentViewer();
  const { show } = useToast();

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === documents.length ? new Set() : new Set(documents.map((d) => d.id))));
  }

  function handleApprove() {
    const ids = Array.from(selected);
    startTransition(async () => {
      const result = await approveDocumentsAction(ids);
      show(result.error ?? `Approved ${ids.length} document${ids.length === 1 ? "" : "s"}.`, result.error ? "error" : "success");
      setSelected(new Set());
    });
  }

  function handleReject() {
    const ids = Array.from(selected);
    startTransition(async () => {
      const result = await rejectDocumentsAction(ids, note);
      show(result.error ?? `Rejected ${ids.length} document${ids.length === 1 ? "" : "s"}.`, result.error ? "error" : "success");
      setSelected(new Set());
      setNote("");
      setRejectNoteOpen(false);
    });
  }

  if (documents.length === 0) {
    return <p className="py-16 text-center text-sm text-neutral-400">Nothing waiting on review right now.</p>;
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-3">
        <label className="flex items-center gap-2 text-xs font-medium text-neutral-500">
          <input
            type="checkbox"
            checked={selected.size === documents.length}
            onChange={toggleAll}
            className="rounded border-neutral-300"
          />
          {selected.size > 0 ? `${selected.size} selected` : "Select all"}
        </label>

        {selected.size > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={isPending}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              style={{ background: "#2e7d3f" }}
            >
              Approve
            </button>
            <button
              type="button"
              onClick={() => setRejectNoteOpen((v) => !v)}
              disabled={isPending}
              className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
              style={{ background: "#b3342c" }}
            >
              Reject
            </button>
          </div>
        )}
      </div>

      {rejectNoteOpen && (
        <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-6 py-3">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Reason for rejection (shown to the uploader)"
            className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={handleReject}
            disabled={isPending || !note.trim()}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
            style={{ background: "#b3342c" }}
          >
            Confirm reject
          </button>
        </div>
      )}

      <div className="px-6">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-xs font-semibold text-neutral-500">
              <th className="w-8 py-3" />
              <th className="py-3">Name</th>
              <th className="w-32 py-3">Team</th>
              <th className="w-40 py-3">Submitted</th>
              <th className="w-44 py-3">Submitted by</th>
              <th className="w-16 py-3" />
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id} className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50/60">
                <td className="py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(doc.id)}
                    onChange={() => toggle(doc.id)}
                    className="rounded border-neutral-300"
                  />
                </td>
                <td className="py-3 pr-4 font-medium text-neutral-800">{doc.title}</td>
                <td className="py-3 text-neutral-500">
                  {doc.ownerTeam?.name ?? (doc.products.map((p) => p.name).join(", ") || "—")}
                </td>
                <td className="py-3 text-neutral-500" suppressHydrationWarning>
                  {relativeTime(doc.createdAt)}
                </td>
                <td className="py-3 text-neutral-500">{doc.uploadedBy.name}</td>
                <td className="py-3">
                  <button
                    type="button"
                    onClick={() => view(doc)}
                    className="text-xs font-medium"
                    style={{ color: "var(--brand-purple)" }}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {viewerNode}
    </div>
  );
}

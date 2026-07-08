import type { AuditLogEntry } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";

// Kept in sync with DOCUMENT_ACTIONS in backend/src/routes/audit-log.ts —
// this log is scoped to document lifecycle events only (upload/edit/delete),
// not passive views or org-management actions (teams/products/roles).
const ACTION_LABEL: Record<string, string> = {
  upload: "Uploaded",
  upload_version: "Uploaded new version",
  update_tags: "Edited tags",
  approve: "Approved",
  reject: "Rejected",
  delete: "Deleted",
  recover: "Recovered",
  request_deletion: "Requested deletion",
};

export function AuditLogSection({ entries }: { entries: AuditLogEntry[] }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-semibold text-neutral-900">Audit log</h2>
      <p className="mb-4 text-xs text-neutral-400">Most recent {entries.length} events.</p>
      {entries.length === 0 ? (
        <p className="py-8 text-center text-sm text-neutral-400">No activity yet.</p>
      ) : (
        <div className="max-h-[28rem] overflow-y-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="sticky top-0 border-b border-neutral-100 bg-white text-xs font-semibold text-neutral-500">
                <th className="py-2 font-semibold">Action</th>
                <th className="py-2 font-semibold">By</th>
                <th className="py-2 font-semibold">Target</th>
                <th className="py-2 font-semibold">When</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} className="border-b border-neutral-50 last:border-0">
                  <td className="py-2 text-neutral-700">{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td className="py-2 text-neutral-500">{e.user.name}</td>
                  <td className="py-2 font-mono text-xs text-neutral-400">{e.targetId.slice(0, 8)}…</td>
                  <td className="py-2 text-neutral-500" suppressHydrationWarning>
                    {relativeTime(e.createdAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

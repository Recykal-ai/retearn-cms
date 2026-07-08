"use client";

import type { DocumentSummary } from "@/lib/api";
import { DocumentRow } from "@/components/dashboard/DocumentRow";
import { useDocumentViewer } from "@/components/dashboard/useDocumentViewer";

// The "my submissions" table on the Approvals page for non-admins — same row
// rendering as the main browse table, but no sort/search chrome, so it's its
// own small client wrapper rather than reusing DocumentsTable.
export function MyUploadsTable({ documents }: { documents: DocumentSummary[] }) {
  const { view, isOpening, viewerNode } = useDocumentViewer();

  return (
    <div className="px-6">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-100 text-xs font-semibold text-neutral-500">
            <th className="w-8 py-3" />
            <th className="py-3">Name</th>
            <th className="py-3">Tags</th>
            <th className="w-36 py-3">Modified</th>
            <th className="w-40 py-3">Modified by</th>
            <th className="w-28 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <DocumentRow key={doc.id} doc={doc} mode="team" showStatus onView={view} opening={isOpening(doc.id)} />
          ))}
        </tbody>
      </table>
      {viewerNode}
    </div>
  );
}

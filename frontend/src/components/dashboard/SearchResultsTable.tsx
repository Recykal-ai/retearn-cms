"use client";

import type { DocumentSummary } from "@/lib/api";
import { DocumentRow } from "@/components/dashboard/DocumentRow";
import { useDocumentViewer } from "@/components/dashboard/useDocumentViewer";

export function SearchResultsTable({
  documents,
  isAdmin,
  currentUserId,
}: {
  documents: DocumentSummary[];
  isAdmin: boolean;
  currentUserId?: string;
}) {
  const { view, isOpening, viewerNode } = useDocumentViewer();

  return (
    <div className="px-6">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-100 text-xs font-semibold text-neutral-500">
            <th className="py-3">Name</th>
            <th className="py-3">Tags</th>
            <th className="w-36 py-3">Modified</th>
            <th className="w-40 py-3">Modified by</th>
            <th className="w-28 py-3" />
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              mode="team"
              isAdmin={isAdmin}
              currentUserId={currentUserId}
              onView={view}
              opening={isOpening(doc.id)}
            />
          ))}
        </tbody>
      </table>
      {viewerNode}
    </div>
  );
}

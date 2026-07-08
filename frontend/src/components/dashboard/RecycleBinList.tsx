"use client";

import { useState, useTransition } from "react";
import type { DeletedDocumentSummary } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import { FileTypeIcon } from "@/components/dashboard/FileTypeIcon";
import { Tag } from "@/components/dashboard/Tag";
import { fileTypeOf } from "@/lib/file-type";
import { colorForScope, TEAM_TAG_COLOR, PRODUCT_TAG_COLOR } from "@/lib/tag-colors";
import { recoverDocumentAction } from "@/app/dashboard/recycle-bin/recycle-bin-actions";

export function RecycleBinList({ documents }: { documents: DeletedDocumentSummary[] }) {
  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <TrashIcon />
        <p className="text-sm font-medium text-neutral-600">Recycle Bin is empty.</p>
        <p className="max-w-xs text-xs text-neutral-400">Documents deleted by an Admin or Super Admin show up here and can be recovered.</p>
      </div>
    );
  }

  return (
    <div className="px-6 pb-4">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-100 text-xs font-semibold text-neutral-500">
            <th className="py-3 pr-4 font-semibold">Name</th>
            <th className="py-3 pr-4 font-semibold">Tags</th>
            <th className="w-40 py-3 pr-4 font-semibold">Deleted by</th>
            <th className="w-28 py-3 pr-4 font-semibold">Deleted</th>
            <th className="w-28 py-3 font-normal" />
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <RecycleBinRow key={doc.id} doc={doc} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecycleBinRow({ doc }: { doc: DeletedDocumentSummary }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleRecover() {
    startTransition(async () => {
      const result = await recoverDocumentAction(doc.id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <tr className="border-b border-neutral-50 last:border-0">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <FileTypeIcon type={fileTypeOf(doc.title, doc.sourceType)} />
          <span className="font-medium text-neutral-800">{doc.title}</span>
        </div>
      </td>
      <td className="py-3 pr-4">
        <div className="flex flex-wrap gap-1.5">
          {doc.ownerTeam && <Tag label={doc.ownerTeam.name} bg={TEAM_TAG_COLOR.bg} fg={TEAM_TAG_COLOR.fg} />}
          {doc.products.map((p) => (
            <Tag key={p.id} label={p.name} bg={PRODUCT_TAG_COLOR.bg} fg={PRODUCT_TAG_COLOR.fg} />
          ))}
          {doc.categories.map((c) => {
            const color = colorForScope(c.scope);
            return <Tag key={c.id} label={c.name} bg={color.bg} fg={color.fg} />;
          })}
        </div>
      </td>
      <td className="py-3 pr-4 text-neutral-500">{doc.deletedBy?.name ?? "—"}</td>
      <td className="py-3 pr-4 text-neutral-500" suppressHydrationWarning>
        {doc.deletedBy ? relativeTime(doc.deletedBy.at) : "—"}
      </td>
      <td className="py-3">
        <button
          type="button"
          onClick={handleRecover}
          disabled={isPending}
          className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-60"
        >
          {isPending ? "Recovering…" : "Recover"}
        </button>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}

function TrashIcon() {
  return (
    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden style={{ color: "#c9c2ce" }}>
      <path
        d="M5 7h14M9.5 7V5.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2V7M7.5 7l.9 12.1A1.5 1.5 0 0 0 9.9 20.5h4.2a1.5 1.5 0 0 0 1.5-1.4L16.5 7"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.3 10.5v6M13.7 10.5v6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

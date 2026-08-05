"use client";

import { useState } from "react";
import type { DocumentSummary } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import { Tag } from "@/components/dashboard/Tag";
import { FileTypeIcon } from "@/components/dashboard/FileTypeIcon";
import { fileTypeOf } from "@/lib/file-type";
import { colorForCategory, dedupeGlobalCategories, TEAM_TAG_COLOR, PRODUCT_TAG_COLOR } from "@/lib/tag-colors";
import { StatusDot } from "@/components/dashboard/StatusDot";
import { Icon } from "@/components/dashboard/Icon";
import { PinButton } from "@/components/dashboard/PinButton";
import { useDocumentViewer } from "@/components/dashboard/useDocumentViewer";

const STATUS_STYLE: Record<DocumentSummary["status"], { bg: string; fg: string; label: string }> = {
  PUBLISHED: { bg: "#eaf6ec", fg: "#2e7d3f", label: "Published" },
  PENDING: { bg: "#fdf3e2", fg: "#9a6a12", label: "Pending" },
  REJECTED: { bg: "#fbe9e9", fg: "#b3342c", label: "Rejected" },
};

const MAX_VISIBLE_TAGS = 4;

// Reasons a card can't be opened in a `restrictToPublished` view (the main
// dashboard grid) — see the matching helper in DocumentRow.tsx; duplicated
// rather than shared, same convention as this file's own STATUS_STYLE copy.
function blockedReason(doc: DocumentSummary): string | undefined {
  if (doc.deletedAt) return "This document was recently deleted";
  if (doc.status === "PENDING") return "Waiting for admin approval — not viewable until approved";
  if (doc.status === "REJECTED") return "This document was rejected";
  return undefined;
}

export function DocumentsCardGrid({
  documents,
  entityName,
  showStatus,
  restrictToPublished,
}: {
  documents: DocumentSummary[];
  entityName?: string;
  showStatus?: boolean;
  restrictToPublished?: boolean;
}) {
  const [query, setQuery] = useState("");
  const { view, isOpening, viewerNode } = useDocumentViewer();
  const filtered = (() => {
    const q = query.trim().toLowerCase();
    if (!q) return documents;
    return documents.filter(
      (d) => d.title.toLowerCase().includes(q) || d.categories.some((c) => c.name.toLowerCase().includes(q)),
    );
  })();

  return (
    <div>
      <div className="relative mb-4 max-w-xs">
        <Icon
          name="Interface/Search_Magnifying_Glass"
          size={13}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400"
        />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={`Find in ${entityName ?? "this list"}…`}
          className="w-full rounded-md border border-neutral-200 bg-white py-1.5 pr-3 pl-8 text-xs text-neutral-700 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Icon name="File/Files" size={36} style={{ color: "#c9c2ce" }} />
          <div>
            <p className="text-sm font-medium text-neutral-600">
              {query ? `No matches for "${query}"` : `No documents in ${entityName ?? "this view"} yet`}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              showStatus={showStatus}
              onView={view}
              opening={isOpening(doc.id)}
              restrictToPublished={restrictToPublished}
            />
          ))}
        </div>
      )}
      {viewerNode}
    </div>
  );
}

function DocumentCard({
  doc,
  showStatus,
  onView,
  opening,
  restrictToPublished,
}: {
  doc: DocumentSummary;
  showStatus?: boolean;
  onView: (doc: DocumentSummary) => void;
  opening: boolean;
  restrictToPublished?: boolean;
}) {
  const status = STATUS_STYLE[doc.status];
  const isDeleted = Boolean(doc.deletedAt);
  // Deleted is blocked everywhere; Pending/Rejected only in the main browse
  // grid — see the matching comment in DocumentRow.tsx.
  const isBlocked = isDeleted || (Boolean(restrictToPublished) && doc.status !== "PUBLISHED");
  const disabled = opening || isBlocked;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !disabled && onView(doc)}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onView(doc);
        }
      }}
      aria-disabled={disabled}
      title={isBlocked ? blockedReason(doc) : undefined}
      className="flex cursor-pointer flex-col items-start rounded-lg border border-neutral-200 p-4 text-left transition-colors hover:border-neutral-300 hover:shadow-sm aria-disabled:cursor-default aria-disabled:opacity-60"
    >
      <div className="mb-2 flex w-full items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FileTypeIcon type={fileTypeOf(doc.title, doc.sourceType)} externalUrl={doc.externalUrl} />
          <StatusDot status={doc.status} recentlyPublished={doc.recentlyPublished} recentlyDeleted={doc.recentlyDeleted} />
          {doc.deletionRequestedAt && (
            <span
              title="An admin has been asked to delete this document"
              className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap"
              style={{ background: "#f2e8fb", color: "#7c3aed" }}
            >
              Deletion requested
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {showStatus && (
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-medium"
              style={{ background: status.bg, color: status.fg }}
            >
              {status.label}
            </span>
          )}
          {doc.status === "PUBLISHED" && !isDeleted && <PinButton documentId={doc.id} pinned={doc.pinned} />}
        </div>
      </div>
      <p
        className="mb-1.5 line-clamp-2 text-sm font-medium"
        style={{
          color: isDeleted || doc.status === "PENDING" || doc.status === "REJECTED" ? "#a3a3a3" : "#262626",
          textDecoration: isDeleted ? "line-through" : undefined,
        }}
      >
        {doc.title}
      </p>
      <div className="mb-2 flex flex-wrap gap-1">
        {(() => {
          const allTags = [
            ...(doc.ownerTeam ? [{ key: `team-${doc.ownerTeam.id}`, label: doc.ownerTeam.name, bg: TEAM_TAG_COLOR.bg, fg: TEAM_TAG_COLOR.fg }] : []),
            ...doc.products.map((p) => ({ key: `product-${p.id}`, label: p.name, bg: PRODUCT_TAG_COLOR.bg, fg: PRODUCT_TAG_COLOR.fg })),
            ...dedupeGlobalCategories(doc.categories).map((c) => {
              const color = colorForCategory(c);
              return { key: `cat-${c.id}`, label: c.name, bg: color.bg, fg: color.fg };
            }),
          ];
          const visible = allTags.slice(0, MAX_VISIBLE_TAGS);
          const hidden = allTags.slice(MAX_VISIBLE_TAGS);
          return (
            <>
              {visible.map((t) => (
                <Tag key={t.key} label={t.label} bg={t.bg} fg={t.fg} />
              ))}
              {hidden.length > 0 && (
                <span
                  title={hidden.map((t) => t.label).join(", ")}
                  className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500"
                >
                  +{hidden.length} more
                </span>
              )}
            </>
          );
        })()}
      </div>
      <p className="text-xs text-neutral-400">
        <span suppressHydrationWarning>{relativeTime(doc.updatedAt)}</span> · {doc.uploadedBy.name}
      </p>
    </div>
  );
}

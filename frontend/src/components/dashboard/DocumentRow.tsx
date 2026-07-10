"use client";

import type { DocumentSummary } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import { Tag } from "@/components/dashboard/Tag";
import { FileTypeIcon } from "@/components/dashboard/FileTypeIcon";
import { colorForCategory, dedupeGlobalCategories, TEAM_TAG_COLOR, PRODUCT_TAG_COLOR } from "@/lib/tag-colors";
import { fileTypeOf } from "@/lib/file-type";
import { DocumentRowMenu } from "@/components/dashboard/DocumentRowMenu";
import { StatusDot } from "@/components/dashboard/StatusDot";
import { PinButton } from "@/components/dashboard/PinButton";

const STATUS_STYLE: Record<DocumentSummary["status"], { bg: string; fg: string; label: string }> = {
  PUBLISHED: { bg: "#eaf6ec", fg: "#2e7d3f", label: "Published" },
  PENDING: { bg: "#fdf3e2", fg: "#9a6a12", label: "Pending" },
  REJECTED: { bg: "#fbe9e9", fg: "#b3342c", label: "Rejected" },
};

const MAX_VISIBLE_TAGS = 4;

interface TagEntry {
  key: string;
  label: string;
  bg: string;
  fg: string;
  href?: string;
}

export function DocumentRow({
  doc,
  mode,
  entityId,
  showStatus,
  isAdmin,
  currentUserId,
  onView,
  opening,
}: {
  doc: DocumentSummary;
  mode: "team" | "product" | "all";
  entityId?: string;
  showStatus?: boolean;
  isAdmin?: boolean;
  currentUserId?: string;
  onView: (doc: DocumentSummary) => void;
  opening?: boolean;
}) {
  const status = STATUS_STYLE[doc.status];

  const teamIsCurrent = mode === "team" && entityId === doc.ownerTeam?.id;
  const teamHref =
    doc.ownerTeam && !teamIsCurrent ? `/dashboard?mode=team&entity=${doc.ownerTeam.id}` : undefined;

  const productTags = doc.products
    .filter((p) => !(mode === "product" && entityId === p.id))
    .map((p) => ({ id: p.id, name: p.name, href: `/dashboard?mode=product&entity=${p.id}` }));

  // In "all" mode there's no single entity to build a category link off of
  // — the home view's category filter works by NAME across every scope
  // (see page.tsx's categoryNameToIds), so a category chip there filters by
  // its display name instead of one scope-specific id.
  const categoryBaseHref = entityId ? `/dashboard?mode=${mode}&entity=${entityId}` : "/dashboard?mode=all";

  const canEdit = Boolean(isAdmin || (currentUserId && currentUserId === doc.uploadedBy.id));

  const allTags: TagEntry[] = [
    ...(doc.ownerTeam
      ? [{ key: `team-${doc.ownerTeam.id}`, label: doc.ownerTeam.name, bg: TEAM_TAG_COLOR.bg, fg: TEAM_TAG_COLOR.fg, href: teamHref }]
      : []),
    ...productTags.map((p) => ({ key: `product-${p.id}`, label: p.name, bg: PRODUCT_TAG_COLOR.bg, fg: PRODUCT_TAG_COLOR.fg, href: p.href })),
    ...dedupeGlobalCategories(doc.categories).map((c) => {
      const color = colorForCategory(c);
      return {
        key: `cat-${c.id}`,
        label: c.name,
        bg: color.bg,
        fg: color.fg,
        href: `${categoryBaseHref}&category=${entityId ? c.id : encodeURIComponent(c.name)}`,
      };
    }),
  ];
  const visibleTags = allTags.slice(0, MAX_VISIBLE_TAGS);
  const hiddenTags = allTags.slice(MAX_VISIBLE_TAGS);

  return (
    <tr className="border-b border-neutral-50 text-sm last:border-0 hover:bg-neutral-50/60">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          {doc.status === "PUBLISHED" && <PinButton documentId={doc.id} pinned={doc.pinned} />}
          <FileTypeIcon type={fileTypeOf(doc.title, doc.sourceType)} />
          <button
            type="button"
            onClick={() => onView(doc)}
            disabled={opening}
            className="text-left font-medium text-neutral-800 hover:underline disabled:opacity-60"
            style={{ color: opening ? "#a3a3a3" : undefined }}
          >
            {doc.title}
          </button>
          <StatusDot status={doc.status} recentlyPublished={doc.recentlyPublished} />
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
      </td>
      <td className="py-3 pr-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleTags.map((t) => (
            <Tag key={t.key} label={t.label} bg={t.bg} fg={t.fg} href={t.href} />
          ))}
          {hiddenTags.length > 0 && (
            <details className="relative inline-block">
              <summary className="cursor-pointer list-none rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500 hover:bg-neutral-200">
                +{hiddenTags.length} more
              </summary>
              <div className="absolute top-full left-0 z-20 mt-1 flex w-48 flex-wrap gap-1.5 rounded-md border border-neutral-200 bg-white p-2 shadow-lg">
                {hiddenTags.map((t) => (
                  <Tag key={t.key} label={t.label} bg={t.bg} fg={t.fg} href={t.href} />
                ))}
              </div>
            </details>
          )}
        </div>
      </td>
      <td className="w-36 py-3 text-neutral-500" suppressHydrationWarning>
        {relativeTime(doc.updatedAt)}
      </td>
      <td className="w-40 py-3 text-neutral-500">{doc.uploadedBy.name}</td>
      <td className="w-28 py-3">
        {showStatus ? (
          <span
            className="rounded-full px-2.5 py-1 text-xs font-medium"
            style={{ background: status.bg, color: status.fg }}
          >
            {status.label}
          </span>
        ) : (
          <div className="flex justify-end">
            <DocumentRowMenu doc={doc} canEdit={canEdit} isAdmin={Boolean(isAdmin)} />
          </div>
        )}
      </td>
    </tr>
  );
}

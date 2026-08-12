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

// Deletion is orthogonal to `status` (a PUBLISHED doc's status field doesn't
// change when it's soft-deleted), so this is a separate override rather than
// a fifth STATUS_STYLE entry — checked first wherever a status pill renders.
const DELETED_PILL = { bg: "var(--chip-neutral-bg)", fg: "var(--chip-neutral-fg)", label: "Deleted" };
// Distinct from the live purple "Deletion requested" badge above — this is
// the *resolved* outcome (an Admin declined the request, doc stays as-is).
const DECLINED_BADGE = { bg: "var(--chip-neutral-bg)", fg: "var(--chip-neutral-fg)", label: "Deletion declined" };

const MAX_VISIBLE_TAGS = 4;

interface TagEntry {
  key: string;
  label: string;
  bg: string;
  fg: string;
  href?: string;
}

// Reasons a row can't be opened in a `restrictToPublished` view (the main
// dashboard grid) — Approvals/My Uploads never pass that prop, so an
// owner/admin reviewing their own Pending or Rejected doc there is
// unaffected; this only gates the plain browse grid.
function blockedReason(doc: DocumentSummary): string | undefined {
  if (doc.deletedAt) return "This document was recently deleted";
  if (doc.status === "PENDING") return "Waiting for admin approval — not viewable until approved";
  if (doc.status === "REJECTED") return "This document was rejected";
  return undefined;
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
  restrictToPublished,
}: {
  doc: DocumentSummary;
  mode: "team" | "product" | "all";
  entityId?: string;
  showStatus?: boolean;
  isAdmin?: boolean;
  currentUserId?: string;
  onView: (doc: DocumentSummary) => void;
  opening?: boolean;
  restrictToPublished?: boolean;
}) {
  const status = STATUS_STYLE[doc.status];
  const isDeleted = Boolean(doc.deletedAt);
  // Deleted is blocked everywhere (no content left to open, anywhere) —
  // Pending/Rejected are only blocked in the main browse grid, since an
  // owner/admin legitimately views their own Pending/Rejected doc from
  // Approvals/My Uploads.
  const isBlocked = isDeleted || (Boolean(restrictToPublished) && doc.status !== "PUBLISHED");
  const showDeclinedBadge = Boolean(doc.deletionDeclinedAt) && !doc.deletionRequestedAt && !isDeleted;

  const teamIsCurrent = mode === "team" && entityId === doc.ownerTeam?.id;
  const teamHref =
    doc.ownerTeam && !teamIsCurrent ? `/dashboard?mode=team&entity=${doc.ownerTeam.id}` : undefined;

  // Always shown, current-product tag included — same treatment as the team
  // chip above (still rendered when it's the entity you're already inside,
  // just not a link to itself). Previously hidden entirely, which read as
  // "this document has no Ace tag" when browsing Ace's own folder, when
  // really it just wasn't being drawn.
  const productTags = doc.products.map((p) => ({
    id: p.id,
    name: p.name,
    href: mode === "product" && entityId === p.id ? undefined : `/dashboard?mode=product&entity=${p.id}`,
  }));

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
    <tr className="border-b border-neutral-50 text-sm last:border-0 hover:bg-neutral-50/60 dark:border-neutral-800 dark:hover:bg-neutral-800/60">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          {doc.status === "PUBLISHED" && !isDeleted && <PinButton documentId={doc.id} pinned={doc.pinned} />}
          <FileTypeIcon type={fileTypeOf(doc.title, doc.sourceType)} externalUrl={doc.externalUrl} />
          <button
            type="button"
            onClick={() => !isBlocked && onView(doc)}
            disabled={opening || isBlocked}
            title={isBlocked ? blockedReason(doc) : undefined}
            className={`text-left font-medium text-neutral-800 disabled:opacity-60 dark:text-neutral-200 ${isBlocked ? "cursor-default" : "hover:underline"}`}
            style={{
              color: isDeleted || doc.status === "PENDING" || doc.status === "REJECTED" || opening ? "#a3a3a3" : undefined,
              textDecoration: isDeleted ? "line-through" : undefined,
            }}
          >
            {doc.title}
          </button>
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
      </td>
      <td className="py-3 pr-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {visibleTags.map((t) => (
            <Tag key={t.key} label={t.label} bg={t.bg} fg={t.fg} href={t.href} />
          ))}
          {hiddenTags.length > 0 && (
            <details className="relative inline-block">
              <summary className="cursor-pointer list-none rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700">
                +{hiddenTags.length} more
              </summary>
              <div className="absolute top-full left-0 z-20 mt-1 flex w-48 flex-wrap gap-1.5 rounded-md border border-neutral-200 bg-white p-2 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
                {hiddenTags.map((t) => (
                  <Tag key={t.key} label={t.label} bg={t.bg} fg={t.fg} href={t.href} />
                ))}
              </div>
            </details>
          )}
        </div>
      </td>
      <td className="w-36 py-3 text-neutral-500 dark:text-neutral-400" suppressHydrationWarning>
        {relativeTime(doc.updatedAt)}
      </td>
      <td className="w-40 py-3 text-neutral-500 dark:text-neutral-400">{doc.uploadedBy.name}</td>
      <td className="w-28 py-3">
        {showStatus ? (
          <div className="flex flex-col items-start gap-1">
            <span
              className="rounded-full px-2.5 py-1 text-xs font-medium"
              style={isDeleted ? { background: DELETED_PILL.bg, color: DELETED_PILL.fg } : { background: status.bg, color: status.fg }}
            >
              {isDeleted ? DELETED_PILL.label : status.label}
            </span>
            {showDeclinedBadge && (
              <span
                className="rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap"
                style={{ background: DECLINED_BADGE.bg, color: DECLINED_BADGE.fg }}
              >
                {DECLINED_BADGE.label}
              </span>
            )}
          </div>
        ) : (
          <div className="flex justify-end">
            {/* Hidden, not just disabled — every action in this menu (edit,
                version history, share, delete) targets doc.id against
                endpoints that 404 on a Pending/Rejected/Deleted doc here,
                since restrictToPublished means the same isBlocked gate
                already stops the row from being opened at all. */}
            {!isBlocked && <DocumentRowMenu doc={doc} canEdit={canEdit} isAdmin={Boolean(isAdmin)} />}
          </div>
        )}
      </td>
    </tr>
  );
}

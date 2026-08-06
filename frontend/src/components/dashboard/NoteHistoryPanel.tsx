"use client";

import type { TeamNoteActivityEntry } from "@/lib/api";
import type { NoteAnchorKind } from "@/components/dashboard/RichTextEditor";
import { relativeTime } from "@/lib/relative-time";

function anchorKindFor(action: TeamNoteActivityEntry["action"]): NoteAnchorKind | null {
  if (action === "ADDED_IMAGE") return "image";
  if (action === "LINKED_DOCUMENT") return "document";
  if (action === "ADDED_COMMENT" || action === "RESOLVED_COMMENT" || action === "REOPENED_COMMENT") return "comment";
  return null;
}

// Deliberately structured, not a text diff — see note-content-diff.ts on the
// backend. Plain typing/formatting collapses into one generic "edited the
// note" line; only image/document/comment events carry a specific
// description and a working "jump to" (anchorKindFor above returns null for
// the two that don't, and those rows just aren't clickable).
function describeActivity(entry: TeamNoteActivityEntry): string {
  const name = entry.user.name;
  const meta = entry.metadata ?? {};
  switch (entry.action) {
    case "EDITED_DETAILS": {
      const titleChanged = Boolean(meta.titleChanged);
      const meetingAtChanged = Boolean(meta.meetingAtChanged);
      if (titleChanged && meetingAtChanged) return `${name} updated the title and date`;
      if (titleChanged) return `${name} updated the title`;
      return `${name} updated the date`;
    }
    case "ADDED_IMAGE":
      return `${name} added an image`;
    case "LINKED_DOCUMENT":
      return `${name} linked "${typeof meta.title === "string" ? meta.title : "a document"}"`;
    case "ADDED_COMMENT":
      return meta.isReply
        ? `${name} replied to a comment: "${meta.quotedText ?? ""}"`
        : `${name} commented on "${meta.quotedText ?? ""}"`;
    case "RESOLVED_COMMENT":
      return `${name} resolved a comment on "${meta.quotedText ?? ""}"`;
    case "REOPENED_COMMENT":
      return `${name} reopened a comment on "${meta.quotedText ?? ""}"`;
    case "EDITED_CONTENT":
      return `${name} edited the note`;
    default:
      return `${name} made a change`;
  }
}

export function NoteHistoryPanel({
  entries,
  loading,
  onJump,
}: {
  entries: TeamNoteActivityEntry[];
  loading: boolean;
  onJump: (kind: NoteAnchorKind, anchorId: string) => void;
}) {
  return (
    <div
      className="absolute top-full right-0 z-20 mt-2 w-80 rounded-lg border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      <p className="border-b border-neutral-100 px-3 py-2 text-xs font-semibold tracking-wide text-neutral-400 uppercase dark:border-neutral-800 dark:text-neutral-500">
        Update history
      </p>
      <div className="max-h-80 overflow-y-auto py-1">
        {loading && <p className="px-3 py-3 text-xs text-neutral-400 dark:text-neutral-500">Loading…</p>}
        {!loading && entries.length === 0 && <p className="px-3 py-3 text-xs text-neutral-400 dark:text-neutral-500">No changes yet</p>}
        {entries.map((entry) => {
          const kind = anchorKindFor(entry.action);
          const clickable = kind !== null && entry.anchorId !== null;
          const Wrapper = clickable ? "button" : "div";
          return (
            <Wrapper
              key={entry.id}
              type={clickable ? "button" : undefined}
              onClick={clickable ? () => onJump(kind!, entry.anchorId!) : undefined}
              className={`block w-full px-3 py-2 text-left text-xs ${clickable ? "hover:bg-neutral-50 dark:hover:bg-neutral-800" : ""}`}
            >
              <p className="text-neutral-700 dark:text-neutral-300">{describeActivity(entry)}</p>
              <p className="mt-0.5 text-[11px] text-neutral-400 dark:text-neutral-500">{relativeTime(entry.createdAt)}</p>
            </Wrapper>
          );
        })}
      </div>
    </div>
  );
}

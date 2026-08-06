"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, AnimatePresence, LayoutGroup } from "motion/react";
import type { TeamNoteCommentEntry } from "@/lib/api";
import type { RichTextEditorHandle } from "@/components/dashboard/RichTextEditor";
import { relativeTime } from "@/lib/relative-time";
import { useToast } from "@/components/ToastProvider";
import { MentionInput, type MentionCandidate } from "@/components/dashboard/MentionInput";
import {
  addTeamNoteCommentAction,
  editTeamNoteCommentAction,
  resolveTeamNoteCommentAction,
  deleteTeamNoteCommentAction,
} from "@/app/dashboard/notes-actions";

const CARD_WIDTH = 260;
const CARD_GAP_FROM_CONTENT = 16; // space between the content column's own right edge and a card
const MIN_RIGHT_PADDING = 16; // never let a card's right edge touch the scroll container's own edge
// Total width a card needs to its right, beyond the content column's own
// edge — TeamNoteEditor.tsx's content column width is capped via this same
// number (see its CONTENT_MARGIN_RESERVE) so the column's own centering
// math always leaves enough room for a card, on any window width, without
// the column and the card ever needing to know about each other's state.
export const CONTENT_MARGIN_RESERVE = CARD_WIDTH + CARD_GAP_FROM_CONTENT + MIN_RIGHT_PADDING;
const CARD_GAP = 10;
const FALLBACK_HEIGHT = 80; // used only until a card's real height has been measured once

export interface DraftComment {
  range: { from: number; to: number };
  quotedText: string;
}

// Positioned adjacent to each thread's highlighted line (Google Docs/Notion
// margin-note style), as an absolutely-positioned layer *inside* the note's
// own scroll container (see TeamNoteEditor.tsx) — plain page scroll carries
// the cards along with the text natively, no scroll-position math needed
// here. Two things sank the first attempt at this and are fixed below:
// cards weren't reliably visible because the position math used an
// *estimated* card height for collision avoidance, which silently drifted
// from the real rendered height (especially once collapse/expand-on-tap was
// added and one card could be much taller than the rest) — this version
// renders each card at its raw anchor position first, then measures actual
// DOM height via refs and re-lays-out using real numbers; the "settle into
// place" animation you'd see from that two-pass approach is a feature, not
// a bug, since Motion's `layout` prop animates it smoothly anyway.
export function FloatingComments({
  teamNoteId,
  comments,
  members,
  currentUserId,
  editorRef,
  scrollContainerRef,
  contentColumnRef,
  contentVersion,
  onJumpToText,
  hoveredThreadId,
  onHoverThread,
  onChanged,
  onThreadDeleted,
  draft,
  onSubmitDraft,
  onCancelDraft,
}: {
  teamNoteId: string;
  comments: TeamNoteCommentEntry[];
  members: MentionCandidate[];
  currentUserId: string;
  editorRef: React.RefObject<RichTextEditorHandle | null>;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
  contentColumnRef: React.RefObject<HTMLDivElement | null>;
  contentVersion: string;
  onJumpToText: (threadId: string) => void;
  hoveredThreadId: string | null;
  onHoverThread: (threadId: string | null) => void;
  onChanged: () => void;
  onThreadDeleted: (threadId: string) => void;
  draft: DraftComment | null;
  onSubmitDraft: (body: string, mentionedUserIds: string[]) => void;
  onCancelDraft: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [rawTops, setRawTops] = useState<Record<string, number>>({});
  const [finalTops, setFinalTops] = useState<Record<string, number>>({});
  // A single shared x-position for every card, anchored to the content
  // column's own right edge rather than a fixed offset from the scroll
  // container's edge — so a truly centered column (equal margins both
  // sides, see TeamNoteEditor.tsx) doesn't leave cards stranded in a huge
  // empty gap when the window is wide, the way a fixed `right` did.
  // Clamped so cards never render past the container's own right edge on
  // narrower windows.
  const [cardLeft, setCardLeft] = useState<number | null>(null);
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const roots = comments.filter((c) => c.parentId === null).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  // The compose row's own avatar is always "you" — whoever's about to type,
  // not whichever thread they're replying to — so it comes from the member
  // list (which always includes the current user, since membership is what
  // grants access to the note at all), not from any comment's author.
  const currentUserName = members.find((m) => m.id === currentUserId)?.label ?? "";

  // A new draft always means "show me what I'm about to type" — expand it
  // immediately rather than leaving it collapsed.
  useEffect(() => {
    if (draft) setExpandedId("__draft__");
  }, [draft]);

  function toggleExpanded(id: string) {
    setExpandedId((cur) => (cur === id ? null : id));
    onJumpToText(id);
  }

  // Pass 1: where each card *would* sit right next to its anchor, with no
  // regard for whether that overlaps a neighbor — recomputed whenever the
  // set of threads changes, the note is edited (debounced — an edit above a
  // comment can shift everything below it), or the viewport resizes.
  function computeRawTops() {
    const container = scrollContainerRef.current;
    const editor = editorRef.current;
    if (!container || !editor) return;
    const containerRect = container.getBoundingClientRect();
    const contentColumn = contentColumnRef.current;
    if (contentColumn) {
      const columnRect = contentColumn.getBoundingClientRect();
      const raw = columnRect.right - containerRect.left + CARD_GAP_FROM_CONTENT;
      const max = containerRect.width - CARD_WIDTH - MIN_RIGHT_PADDING;
      setCardLeft(Math.min(raw, max));
    }
    const next: Record<string, number> = {};
    for (const root of roots) {
      const rect = editor.getAnchorRect("comment", root.id);
      if (rect) next[root.id] = rect.top - containerRect.top + container.scrollTop;
    }
    if (draft) {
      const top = editor.getViewportTopAtPos(draft.range.to);
      if (top !== null) next.__draft__ = top - containerRect.top + container.scrollTop;
    }
    setRawTops(next);
  }

  // NOT a bare `useLayoutEffect(computeRawTops)` — computeRawTops always
  // calls setRawTops with a *new* object, so running it on every render
  // (rather than only when comments/draft actually change) would set state
  // every render and loop forever.
  useLayoutEffect(computeRawTops, [comments, draft]); // eslint-disable-line react-hooks/exhaustive-deps

  // The debounced-on-edit and on-resize recomputes fire from a timer/event
  // listener set up in an earlier render, so they'd otherwise close over
  // whatever `roots`/`draft` were *at the time the effect last (re)armed* —
  // typically mount, when comments hadn't loaded yet (fetched async) and
  // `roots` was still []. 200ms later that stale closure would run and wipe
  // the positions that had *just* been correctly computed once real data
  // arrived — cards would render for a moment, then vanish for good. A ref
  // updated every render sidesteps this: both callers below always invoke
  // whatever computeRawTops is current right now, not whichever one existed
  // when the timer/listener was set up.
  const computeRawTopsRef = useRef(computeRawTops);
  useEffect(() => {
    computeRawTopsRef.current = computeRawTops;
  });

  useEffect(() => {
    const timer = setTimeout(() => computeRawTopsRef.current(), 200);
    return () => clearTimeout(timer);
  }, [contentVersion]);

  useEffect(() => {
    const handler = () => computeRawTopsRef.current();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Pass 2: nudge anything that would overlap down, using each card's *real*
  // rendered height (cardRefs), not a guess — this is what makes the result
  // actually collision-free regardless of reply count/resolved state/which
  // card is expanded.
  useLayoutEffect(() => {
    const ids = Object.keys(rawTops);
    if (ids.length === 0) {
      setFinalTops({});
      return;
    }
    const items = ids
      .map((id) => ({ id, top: rawTops[id], height: cardRefs.current.get(id)?.offsetHeight ?? FALLBACK_HEIGHT }))
      .sort((a, b) => a.top - b.top);
    let cursor = -Infinity;
    const resolved: Record<string, number> = {};
    for (const item of items) {
      const top = Math.max(item.top, cursor);
      resolved[item.id] = top;
      cursor = top + item.height + CARD_GAP;
    }
    setFinalTops(resolved);
  }, [rawTops, expandedId]);

  if (roots.length === 0 && !draft) return null;
  if (cardLeft === null) return null;

  return (
    <div className="pointer-events-none absolute inset-0">
      <LayoutGroup>
        <AnimatePresence initial={false}>
          {draft && rawTops.__draft__ !== undefined && (
            <motion.div
              key="__draft__"
              ref={(el) => {
                if (el) cardRefs.current.set("__draft__", el);
                else cardRefs.current.delete("__draft__");
              }}
              layout
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 500, damping: 40 }}
              className="pointer-events-auto absolute rounded-lg border bg-white p-2.5 shadow-lg dark:bg-neutral-900"
              style={{ top: finalTops.__draft__ ?? rawTops.__draft__, left: cardLeft, width: CARD_WIDTH, borderColor: "var(--brand-purple)" }}
            >
              <p className="mb-1.5 truncate text-[11px] text-neutral-400 italic dark:text-neutral-500">"{draft.quotedText}"</p>
              <div className="flex items-start gap-1.5">
                <Avatar name={currentUserName} />
                <div className="min-w-0 flex-1">
                  <MentionInput members={members} onSubmit={onSubmitDraft} placeholder="Add a comment…" autoFocus />
                </div>
              </div>
              <button type="button" onClick={onCancelDraft} className="mt-1 text-[11px] text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300">
                Cancel
              </button>
            </motion.div>
          )}

          {roots.map((root) => {
            const top = finalTops[root.id] ?? rawTops[root.id];
            if (top === undefined) return null;
            return (
              <motion.div
                key={root.id}
                ref={(el) => {
                  if (el) cardRefs.current.set(root.id, el);
                  else cardRefs.current.delete(root.id);
                }}
                layout
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
                onMouseEnter={() => onHoverThread(root.id)}
                onMouseLeave={() => onHoverThread(null)}
                className="pointer-events-auto absolute rounded-lg border shadow-sm transition-colors"
                style={{
                  top,
                  left: cardLeft,
                  width: CARD_WIDTH,
                  borderColor: hoveredThreadId === root.id ? "var(--brand-purple)" : "var(--canvas-border, #e5e5e5)",
                  background: hoveredThreadId === root.id ? "var(--brand-purple-tint)" : "white",
                }}
              >
                {expandedId === root.id ? (
                  <div className="p-2.5">
                    <ThreadCardExpanded
                      teamNoteId={teamNoteId}
                      root={root}
                      replies={comments.filter((c) => c.parentId === root.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))}
                      members={members}
                      currentUserId={currentUserId}
                      currentUserName={currentUserName}
                      onChanged={onChanged}
                      onThreadDeleted={onThreadDeleted}
                      onQuotedTextClick={() => toggleExpanded(root.id)}
                    />
                  </div>
                ) : (
                  <button type="button" onClick={() => toggleExpanded(root.id)} className="block w-full p-2.5 text-left">
                    <div className="flex items-start gap-1.5">
                      <Avatar name={root.author.name} />
                      <div className="min-w-0 flex-1">
                        <span className="truncate text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                          {root.author.name} <span className="ml-1 font-normal text-neutral-400 dark:text-neutral-500">{relativeTime(root.createdAt)}</span>
                        </span>
                        <p className="line-clamp-2 text-sm text-neutral-700 dark:text-neutral-300">{root.body}</p>
                        {root.resolved && (
                          <p className="mt-1 flex items-center gap-1 text-[11px] font-medium text-green-700 dark:text-green-400">
                            <span aria-hidden>✓</span> Resolved
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </LayoutGroup>
    </div>
  );
}

function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function Avatar({ name }: { name: string }) {
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
      style={{ background: "var(--brand-purple)" }}
    >
      {initial(name)}
    </span>
  );
}

function ThreadCardExpanded({
  teamNoteId,
  root,
  replies,
  members,
  currentUserId,
  currentUserName,
  onChanged,
  onThreadDeleted,
  onQuotedTextClick,
}: {
  teamNoteId: string;
  root: TeamNoteCommentEntry;
  replies: TeamNoteCommentEntry[];
  members: MentionCandidate[];
  currentUserId: string;
  currentUserName: string;
  onChanged: () => void;
  onThreadDeleted: (threadId: string) => void;
  onQuotedTextClick: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const { show } = useToast();

  async function handleResolveToggle() {
    setBusy(true);
    const result = await resolveTeamNoteCommentAction(teamNoteId, root.id, !root.resolved);
    setBusy(false);
    if (result.error) {
      show(result.error, "error");
      return;
    }
    onChanged();
  }

  async function handleDelete(commentId: string) {
    setBusy(true);
    const result = await deleteTeamNoteCommentAction(teamNoteId, commentId);
    setBusy(false);
    if (result.error) {
      show(result.error, "error");
      return;
    }
    if (commentId === root.id) {
      onThreadDeleted(root.id);
    } else {
      onChanged();
    }
  }

  async function handleReply(body: string, mentionedUserIds: string[]) {
    const result = await addTeamNoteCommentAction(teamNoteId, { quotedText: root.quotedText, body, parentId: root.id, mentionedUserIds });
    if (result.error) {
      show(result.error, "error");
      return;
    }
    onChanged();
  }

  function handleCopyLink() {
    const url = new URL(window.location.href);
    url.searchParams.set("teamNote", teamNoteId);
    url.searchParams.set("comment", root.id);
    navigator.clipboard.writeText(url.toString()).then(
      () => show("Link copied", "success"),
      () => show("Couldn't copy link", "error"),
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={onQuotedTextClick}
        title="Collapse, and highlight this text in the note"
        className="mb-1.5 block w-full truncate text-left text-[11px] text-neutral-400 italic hover:underline dark:text-neutral-500"
      >
        "{root.quotedText}"
      </button>

      {root.resolved && (
        <p className="mb-1.5 flex items-center gap-1 text-[11px] font-medium text-green-700 dark:text-green-400">
          <span aria-hidden>✓</span> Resolved by {root.resolvedBy?.name ?? "someone"}
        </p>
      )}

      <Message comment={root} teamNoteId={teamNoteId} currentUserId={currentUserId} onDelete={() => handleDelete(root.id)} onCopyLink={handleCopyLink} onChanged={onChanged}>
        <button
          type="button"
          onClick={handleResolveToggle}
          disabled={busy}
          title={root.resolved ? "Reopen this thread" : "Mark this thread as resolved"}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs"
          style={
            root.resolved
              ? { background: "var(--brand-purple-tint)", color: "var(--brand-purple)" }
              : { border: "1px solid #d1d5db", color: "#a3a3a3" }
          }
        >
          ✓
        </button>
      </Message>

      {replies.map((r) => (
        <div key={r.id} className="mt-1.5 border-t border-neutral-100 pt-1.5 dark:border-neutral-800">
          <Message comment={r} teamNoteId={teamNoteId} currentUserId={currentUserId} onDelete={() => handleDelete(r.id)} onChanged={onChanged} />
        </div>
      ))}

      <div className="mt-2 flex items-start gap-1.5">
        <Avatar name={currentUserName} />
        <div className="min-w-0 flex-1">
          <MentionInput members={members} onSubmit={handleReply} placeholder="Reply…" />
        </div>
      </div>
    </>
  );
}

export function Message({
  comment,
  teamNoteId,
  currentUserId,
  onDelete,
  onCopyLink,
  onChanged,
  children,
}: {
  comment: TeamNoteCommentEntry;
  teamNoteId: string;
  currentUserId: string;
  onDelete: () => void;
  onCopyLink?: () => void;
  onChanged: () => void;
  children?: React.ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.body);
  const { show } = useToast();

  async function saveEdit() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    const result = await editTeamNoteCommentAction(teamNoteId, comment.id, trimmed);
    if (result.error) {
      show(result.error, "error");
      return;
    }
    setEditing(false);
    onChanged();
  }

  return (
    <div className="group flex items-start gap-1.5">
      <Avatar name={comment.author.name} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            {comment.author.name} <span className="ml-1 font-normal text-neutral-400 dark:text-neutral-500">{relativeTime(comment.createdAt)}</span>
          </span>
        </div>
        {editing ? (
          <div className="mt-0.5 flex items-center gap-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveEdit();
                if (e.key === "Escape") setEditing(false);
              }}
              className="w-full rounded-md border border-neutral-200 px-2 py-1 text-xs focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:focus:border-neutral-500"
            />
            <button type="button" onClick={saveEdit} className="shrink-0 text-xs font-medium" style={{ color: "var(--brand-purple)" }}>
              Save
            </button>
          </div>
        ) : (
          <p className="text-sm whitespace-pre-wrap text-neutral-700 dark:text-neutral-300">{comment.body}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 group-hover:opacity-100">
        {children}
        <MessageMenu canEdit={comment.author.id === currentUserId} onEdit={() => setEditing(true)} onDelete={onDelete} onCopyLink={onCopyLink} />
      </div>
    </div>
  );
}

function MessageMenu({
  canEdit,
  onEdit,
  onDelete,
  onCopyLink,
}: {
  canEdit: boolean;
  onEdit?: () => void;
  onDelete: () => void;
  onCopyLink?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        aria-label="More options"
        className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-neutral-700"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute top-full right-0 z-10 mt-1 w-32 rounded-md border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          {onCopyLink && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onCopyLink();
              }}
              className="block w-full px-2.5 py-1 text-left text-xs text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Copy link
            </button>
          )}
          {canEdit && onEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onEdit();
              }}
              className="block w-full px-2.5 py-1 text-left text-xs text-neutral-700 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Edit
            </button>
          )}
          {canEdit && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onDelete();
              }}
              className="block w-full px-2.5 py-1 text-left text-xs text-red-600 hover:bg-neutral-50 dark:text-red-400 dark:hover:bg-neutral-800"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}

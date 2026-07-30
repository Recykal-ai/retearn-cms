"use client";

import { useEffect, useRef, useState } from "react";
import {
  getTeamNoteAction,
  updateTeamNoteAction,
  deleteTeamNoteAction,
  addTeamNoteMemberAction,
  removeTeamNoteMemberAction,
  searchCandidateUsersAction,
  getTeamNoteActivityAction,
  getTeamNoteCommentsAction,
  addTeamNoteCommentAction,
} from "@/app/dashboard/notes-actions";
import type { TeamNoteDetail, CandidateUser, TeamNoteActivityEntry, TeamNoteCommentEntry } from "@/lib/api";
import { RichTextEditor, type RichTextEditorHandle, type NoteAnchorKind } from "@/components/dashboard/RichTextEditor";
import { DateTimePicker } from "@/components/dashboard/DateTimePicker";
import { NoteHistoryPanel } from "@/components/dashboard/NoteHistoryPanel";
import { FloatingComments, CONTENT_MARGIN_RESERVE, type DraftComment } from "@/components/dashboard/FloatingComments";
import { IconPickerButton } from "@/components/dashboard/IconPickerButton";
import { MoreVerticalIcon, NoteBreadcrumb } from "@/components/dashboard/NoteFolderTree";
import { Icon } from "@/components/dashboard/Icon";
import { NoteBioComments } from "@/components/dashboard/NoteBioComments";
import { useToast } from "@/components/ToastProvider";

const AUTOSAVE_DELAY_MS = 1200;
const HOVER_FLASH_MS = 2500;

function toLocalInputValue(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatMetaDate(localValue: string): string {
  const [datePart, timePart] = localValue.split("T");
  if (!datePart || !timePart) return localValue;
  const [y, m, d] = datePart.split("-");
  return `${d}-${m}-${y} ${timePart}`;
}

// A titled, shared note for one team — the note list only ever shows notes
// the current user is already a member of, so this component never needs to
// handle a "not a member yet" state; membership is a precondition for it
// rendering at all.
export function TeamNoteEditor({
  noteId,
  currentUserId,
  breadcrumb,
  initialCommentId,
  autoFocusTitle,
  onTitleFocused,
  onSaved,
  onDeleted,
  onFlushRef,
}: {
  noteId: string;
  currentUserId: string;
  // Root-first folder name path (see NoteFolderTree.tsx's buildBreadcrumb),
  // computed by the parent from its own folders list — empty for a note
  // filed at the root, which renders nothing.
  breadcrumb?: string[];
  // Set once by NotesPageContent when arriving via a "Copy link" URL
  // (?teamNote=&comment=) — consumed the first time this note's comments
  // load, then just sits unused; harmless if it doesn't match any thread
  // here (e.g. stale after switching notes).
  initialCommentId?: string | null;
  // True exactly once, right after a quick-create — the title input
  // auto-focuses with "Untitled" pre-selected once the note's detail has
  // actually loaded (there's no title input to focus before then).
  autoFocusTitle?: boolean;
  onTitleFocused?: () => void;
  // Called after every successful title/content/meeting/icon save — the
  // sidebar tree's row (title, icon, "also in" subtitle) is rendered from a
  // separately-fetched list (NotesPageContent's teamNotes/teamTreeNotes
  // state), not from this component's own `detail`, so without this the
  // list only ever catches up on a full page reload.
  onSaved?: () => void;
  onDeleted: () => void;
  // Hands the parent a way to force any pending (debounced) autosave to
  // happen immediately — called on every render so the parent always holds
  // the latest closure. Used by NotesPageContent's "Upload to portal" flow —
  // see PersonalNoteEditor.tsx's matching prop for the full rationale.
  onFlushRef?: (flush: () => Promise<void>) => void;
}) {
  const [detail, setDetail] = useState<TeamNoteDetail | null>(null);
  const [title, setTitle] = useState("");
  const [icon, setIcon] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  const [metaOpen, setMetaOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "saved">("idle");
  const [deleting, setDeleting] = useState(false);
  const [bioComposerOpen, setBioComposerOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<CandidateUser[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [membersOpen, setMembersOpen] = useState(false);
  const [activity, setActivity] = useState<TeamNoteActivityEntry[] | null>(null);
  const [comments, setComments] = useState<TeamNoteCommentEntry[]>([]);
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftComment | null>(null);
  const { show } = useToast();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<RichTextEditorHandle>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const contentColumnRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef({ title, content, meetingAt });
  useEffect(() => {
    latestRef.current = { title, content, meetingAt };
  });

  useEffect(() => {
    let cancelled = false;
    getTeamNoteAction(noteId).then((d) => {
      if (cancelled) return;
      setDetail(d);
      setTitle(d.title);
      setIcon(d.icon);
      setContent(d.content);
      setMeetingAt(d.meetingAt ? toLocalInputValue(d.meetingAt) : "");
      setSaveState("idle");
      if (autoFocusTitle) {
        titleRef.current?.focus();
        titleRef.current?.select();
        onTitleFocused?.();
      }
    });
    getTeamNoteCommentsAction(noteId).then((c) => {
      if (cancelled) return;
      setComments(c);
      if (initialCommentId && c.some((x) => x.id === initialCommentId)) {
        flashHover(initialCommentId);
        setTimeout(() => editorRef.current?.scrollToAnchor("comment", initialCommentId), 300);
      }
    });
    setActivity(null);
    setHistoryOpen(false);
    setMembersOpen(false);
    setDraft(null);
    setBioComposerOpen(false);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  useEffect(() => {
    if (!metaOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (metaRef.current && !metaRef.current.contains(e.target as Node)) setMetaOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [metaOpen]);

  useEffect(() => {
    if (!menuOpen && !historyOpen && !membersOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setHistoryOpen(false);
        setMembersOpen(false);
      }
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [menuOpen, historyOpen, membersOpen]);

  function refreshComments() {
    getTeamNoteCommentsAction(noteId).then(setComments);
  }

  function openHistory() {
    setMenuOpen(false);
    setMembersOpen(false);
    setHistoryOpen((v) => !v);
    if (activity === null) getTeamNoteActivityAction(noteId).then(setActivity);
  }

  function openMembers() {
    setMenuOpen(false);
    setHistoryOpen(false);
    setMembersOpen((v) => !v);
  }

  // A one-off "come look at this" flash for history-panel jumps — distinct
  // from onHoverThread below (which tracks live mouse hover, no timer).
  function flashHover(threadId: string) {
    setHoveredThreadId(threadId);
    if (hoverFlashTimerRef.current) clearTimeout(hoverFlashTimerRef.current);
    hoverFlashTimerRef.current = setTimeout(() => setHoveredThreadId(null), HOVER_FLASH_MS);
  }

  function handleJump(kind: NoteAnchorKind, anchorId: string) {
    setHistoryOpen(false);
    editorRef.current?.scrollToAnchor(kind, anchorId);
    if (kind === "comment") flashHover(anchorId);
  }

  function handleHoverThread(threadId: string | null) {
    if (hoverFlashTimerRef.current) clearTimeout(hoverFlashTimerRef.current);
    setHoveredThreadId(threadId);
  }

  function handleRequestComment(range: { from: number; to: number }, quotedText: string) {
    setDraft({ range, quotedText });
  }

  async function submitDraft(body: string, mentionedUserIds: string[]) {
    if (!draft) return;
    const result = await addTeamNoteCommentAction(noteId, { quotedText: draft.quotedText, body, mentionedUserIds });
    if (result.error || !result.comment) {
      show(result.error ?? "Failed to add comment", "error");
      return;
    }
    editorRef.current?.applyCommentMark(result.comment.id, draft.range);
    setComments((prev) => [...prev, result.comment!]);
    setDraft(null);
  }

  useEffect(() => {
    if (!detail?.canCurate) return;
    let cancelled = false;
    searchCandidateUsersAction(noteId, query).then((c) => {
      if (!cancelled) setCandidates(c);
    });
    return () => {
      cancelled = true;
    };
  }, [noteId, query, detail?.canCurate]);

  async function flush() {
    const v = latestRef.current;
    const result = await updateTeamNoteAction(noteId, {
      title: v.title,
      content: v.content,
      meetingAt: v.meetingAt ? new Date(v.meetingAt).toISOString() : null,
    });
    if (result.error) {
      show(result.error, "error");
      return;
    }
    setSaveState("saved");
    onSaved?.();
  }

  function scheduleSave() {
    setSaveState("pending");
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, AUTOSAVE_DELAY_MS);
  }

  async function forceFlush() {
    if (!timerRef.current) return; // nothing pending — already saved
    clearTimeout(timerRef.current);
    timerRef.current = null;
    await flush();
  }

  useEffect(() => {
    onFlushRef?.(forceFlush);
  });

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        flush();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId]);

  // Icon changes save immediately (not debounced) — a discrete, deliberate
  // pick from the picker, not incremental typing.
  async function handleSetIcon(next: string | null) {
    setIcon(next);
    const result = await updateTeamNoteAction(noteId, { icon: next });
    if (result.error) {
      show(result.error, "error");
      return;
    }
    onSaved?.();
  }

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteTeamNoteAction(noteId);
    setDeleting(false);
    if (result.error) {
      show(result.error, "error");
      return;
    }
    onDeleted();
  }

  async function handleAddMember(userId: string) {
    const result = await addTeamNoteMemberAction(noteId, userId);
    if (result.error) {
      show(result.error, "error");
      return;
    }
    setDetail(await getTeamNoteAction(noteId));
    setQuery("");
    // Explicit re-fetch, not just setQuery("") — the candidates-search effect
    // below only re-runs when `query` actually changes, so adding someone
    // from the *default* (empty-query) candidate list left them stuck
    // showing in that list even though they're now a member (setQuery("")
    // is a same-value no-op when query was already "").
    setCandidates(await searchCandidateUsersAction(noteId, ""));
  }

  async function handleRemoveMember(userId: string) {
    const result = await removeTeamNoteMemberAction(noteId, userId);
    if (result.error) {
      show(result.error, "error");
      return;
    }
    setDetail(await getTeamNoteAction(noteId));
    // Same reasoning as handleAddMember — a removed member should become an
    // addable candidate again immediately, not just after the query changes.
    setCandidates(await searchCandidateUsersAction(noteId, query));
  }

  if (!detail) {
    return <p className="flex h-full items-center justify-center text-sm text-neutral-400">Loading…</p>;
  }

  // "id: all" is a reserved sentinel, not a real user — recognized specially
  // by both the note-body mention-notify diff (team-notes.ts's PUT route)
  // and MentionInput's comment-reply submit (which expands it into every
  // real member id before sending). Only offered when there's actually more
  // than one member to notify.
  const mentionCandidates = [
    ...(detail.members.length > 1 ? [{ id: "all", label: "All members" }] : []),
    ...detail.members.map((m) => ({ id: m.id, label: m.name })),
  ];
  // Same "" sentinel NoteBioComments itself filters on — see that file.
  const hasBioComments = comments.some((c) => c.parentId === null && c.quotedText === "");
  // One layout, always — not "centered when there's nothing to comment on,
  // pushed left once something is." Switching between two different shapes
  // depending on comment count made the page visibly jump/reflow every time
  // a comment got added or resolved away, which read as more broken than
  // either shape alone. The content column is truly centered (equal margins
  // both sides, like Notion) at all times; comment cards float in whatever
  // space sits to the right of the column's own edge (see FloatingComments'
  // contentColumnRef-based positioning). The column's own max-width is
  // capped by a CSS min() against the pane's width, minus the fixed space a
  // card needs (CONTENT_MARGIN_RESERVE, shared with FloatingComments) — so
  // on a wide window it's a comfortable 760px reading column with a card
  // parked in the leftover margin, and on a narrower window (e.g. a 1440px
  // laptop, where this pane is ~1120px after the note list) both margins
  // shrink together in lockstep, still equal, always leaving exactly enough
  // room for a card rather than letting one overlap the text (the original
  // bug this whole layout was built to avoid).
  const contentStyle: React.CSSProperties = {
    maxWidth: `min(760px, calc(100% - ${CONTENT_MARGIN_RESERVE * 2}px))`,
    marginLeft: "auto",
    marginRight: "auto",
    paddingLeft: 40,
    paddingRight: 40,
  };

  return (
    <div ref={scrollContainerRef} className="relative h-full overflow-y-auto" data-notes-scroll-container>
      {/* Pinned near the top-right of the pane, independent of the title
          row's own width — Notion's own page controls (Share/comment/"...")
          live in a fixed top bar rather than sharing a flex row with the
          title, which is what made this drift so far from the title once
          the content column got wide. */}
      <div className="absolute top-6 right-6 z-30 flex items-center gap-2">
        <span className="shrink-0 text-xs text-neutral-400">
          {saveState === "pending" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
        </span>
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setHistoryOpen(false);
              setMembersOpen(false);
              setMenuOpen((v) => !v);
            }}
            aria-label="Note options"
            className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
          >
            <MoreVerticalIcon />
          </button>
          {menuOpen && (
              <div className="absolute top-full right-0 z-20 mt-1 w-44 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setMetaOpen(true);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  Edit details
                </button>
                <button
                  type="button"
                  onClick={openMembers}
                  className="block w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  Manage members
                </button>
                <button
                  type="button"
                  onClick={openHistory}
                  className="block w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                >
                  Update history
                </button>
                {detail.canCurate && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      handleDelete();
                    }}
                    disabled={deleting}
                    className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-neutral-50 disabled:opacity-60"
                  >
                    {deleting ? "Deleting…" : "Delete"}
                  </button>
                )}
              </div>
            )}
            {historyOpen && (
              <NoteHistoryPanel entries={activity ?? []} loading={activity === null} onJump={handleJump} />
            )}
            {membersOpen && (
              <div className="absolute top-full right-0 z-20 mt-1 w-64 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
                <p className="mb-2 text-xs font-semibold tracking-wide text-neutral-400 uppercase">Members</p>
                <ul className="mb-3 max-h-40 space-y-1 overflow-y-auto">
                  {/* Creator pinned to the top regardless of membership-row
                      order (addedAt can tie across everyone added in the
                      same initial creation batch, so it isn't a reliable
                      "creator is first" signal on its own) — identified via
                      detail.createdBy.id, not position. */}
                  {[...detail.members].sort((a, b) => Number(b.id === detail.createdBy.id) - Number(a.id === detail.createdBy.id)).map((m) => {
                    const isCreator = m.id === detail.createdBy.id;
                    return (
                      <li key={m.id} className="group flex items-center justify-between gap-1">
                        <span className="flex min-w-0 items-baseline gap-1.5">
                          <span className="truncate text-sm text-neutral-700">{m.name}</span>
                          {isCreator && (
                            <span className="shrink-0 rounded-full bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500">
                              Creator
                            </span>
                          )}
                        </span>
                        {/* The creator can't be removed from their own note —
                            not by themself, not by another curator. */}
                        {detail.canCurate && !isCreator && (
                          <button
                            type="button"
                            onClick={() => handleRemoveMember(m.id)}
                            aria-label={`Remove ${m.name}`}
                            className="shrink-0 text-xs text-neutral-400 opacity-0 hover:text-red-600 group-hover:opacity-100"
                          >
                            ✕
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {detail.canCurate && (
                  <div>
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Add someone…"
                      className="mb-1.5 w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs focus:border-neutral-400 focus:outline-none"
                    />
                    <ul className="max-h-32 space-y-0.5 overflow-y-auto">
                      {candidates.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => handleAddMember(c.id)}
                            className="block w-full truncate rounded-md px-2 py-1 text-left text-xs text-neutral-700 hover:bg-neutral-50"
                          >
                            {c.name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      <div ref={contentColumnRef} className="py-8" style={contentStyle} data-notes-content-column>
        <NoteBreadcrumb path={breadcrumb ?? []} />
        {/* "Add icon"/"Add comment" only appear on hovering the title block
            specifically — scoped to just this inner wrapper (icon row +
            title input), not the whole content column (contentColumnRef
            can't carry the group itself: its height is stretched by
            RichTextEditor's min-h-[65vh] descendant, which would make
            "hovering anywhere in the note body" count as "hovering the
            title" too). Matches Notion's own "Add icon"/"Add cover" row —
            once an icon is actually set it's always shown (large,
            permanent); once a bio comment exists, NoteBioComments renders
            itself permanently too, so this row's job is just offering the
            *first* one. */}
        <div className="group">
          <div className="mb-1 flex items-center gap-1">
            <div className={icon ? "" : "opacity-0 transition-opacity group-hover:opacity-100"}>
              <IconPickerButton
                icon={icon}
                fallback={<TitleIconPlaceholder />}
                onSelect={handleSetIcon}
                onClear={() => handleSetIcon(null)}
                size={icon ? "lg" : "md"}
                label={icon ? undefined : "Add icon"}
              />
            </div>
            {!hasBioComments && !bioComposerOpen && (
              <button
                type="button"
                onClick={() => setBioComposerOpen(true)}
                className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-neutral-500 opacity-0 transition-opacity hover:bg-neutral-100 hover:text-neutral-700 group-hover:opacity-100"
              >
                <Icon name="Communication/Chat" size={14} />
                Add comment
              </button>
            )}
          </div>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              scheduleSave();
            }}
            className="mb-1 w-full text-3xl font-bold text-neutral-900 focus:outline-none"
            placeholder="Note title"
          />
        </div>

        <div ref={metaRef} className="relative mb-4">
          <button
            type="button"
            onClick={() => setMetaOpen((v) => !v)}
            className="text-sm text-neutral-400 hover:text-neutral-600 hover:underline"
          >
            {[detail.teamName, meetingAt ? formatMetaDate(meetingAt) : null, `Created by: ${detail.createdBy.name}`]
              .filter(Boolean)
              .join(" · ")}
          </button>

          {metaOpen && (
            <div className="absolute top-full left-0 z-20 mt-2 w-64 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
              <label className="mb-1 block text-xs font-semibold text-neutral-500">Meeting date/time</label>
              <DateTimePicker
                value={meetingAt}
                onChange={(v) => {
                  setMeetingAt(v);
                  scheduleSave();
                }}
              />
            </div>
          )}
        </div>

        <NoteBioComments
          teamNoteId={noteId}
          comments={comments}
          members={mentionCandidates}
          currentUserId={currentUserId}
          currentUserName={detail.members.find((m) => m.id === currentUserId)?.name ?? ""}
          forceOpen={bioComposerOpen}
          onChanged={refreshComments}
        />

        <RichTextEditor
          ref={editorRef}
          content={content}
          onChange={(html) => {
            setContent(html);
            scheduleSave();
          }}
          mentionCandidates={mentionCandidates}
          placeholder="Type @ to mention someone…"
          comments={comments.filter((c) => c.parentId === null).map((c) => ({ threadId: c.id, resolved: c.resolved }))}
          onRequestComment={handleRequestComment}
          onCommentMarkClick={(threadId) => flashHover(threadId)}
          onCommentMarkHover={handleHoverThread}
          hoveredThreadId={hoveredThreadId}
        />
      </div>

      <FloatingComments
        teamNoteId={noteId}
        comments={comments}
        members={mentionCandidates}
        currentUserId={currentUserId}
        editorRef={editorRef}
        scrollContainerRef={scrollContainerRef}
        contentColumnRef={contentColumnRef}
        contentVersion={content}
        onJumpToText={(threadId) => editorRef.current?.scrollToAnchor("comment", threadId)}
        hoveredThreadId={hoveredThreadId}
        onHoverThread={handleHoverThread}
        onChanged={refreshComments}
        onThreadDeleted={(threadId) => {
          editorRef.current?.removeCommentMark(threadId);
          refreshComments();
        }}
        draft={draft}
        onSubmitDraft={submitDraft}
        onCancelDraft={() => setDraft(null)}
      />
    </div>
  );
}

function TitleIconPlaceholder() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden className="text-neutral-300">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 10h.01M15 10h.01M8.5 14.5c.9 1 2.1 1.5 3.5 1.5s2.6-.5 3.5-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { getTagCatalogAction } from "@/app/dashboard/documents-actions";
import { updatePersonalNoteAction, deletePersonalNoteAction } from "@/app/dashboard/notes-actions";
import type { PersonalNote, Team } from "@/lib/api";
import { RichTextEditor } from "@/components/dashboard/RichTextEditor";
import { DateTimePicker } from "@/components/dashboard/DateTimePicker";
import { IconPickerButton } from "@/components/dashboard/IconPickerButton";
import { NoteBreadcrumb } from "@/components/dashboard/NoteFolderTree";
import { useToast } from "@/components/ToastProvider";

const AUTOSAVE_DELAY_MS = 1200;

// A private, per-user note — visible only to its creator, not even Admins.
// teamId here is purely a filing label (which team this note is "about"),
// with no access implication at all. Rendered inline in the right-hand pane
// (parent passes key={note.id} so switching notes remounts fresh state
// rather than carrying stale values over).
//
// Title/team/date are set up front in CreatePersonalNoteModal now, so this
// view stays a clean "title + one metadata line + body" — editing that
// metadata after the fact is opt-in via clicking the metadata line, rather
// than two always-visible form fields sitting above the editor.
export function PersonalNoteEditor({
  note,
  breadcrumb,
  autoFocusTitle,
  onTitleFocused,
  onSaved,
  onDeleted,
  onFlushRef,
}: {
  note: PersonalNote;
  // Root-first folder name path (see NoteFolderTree.tsx's buildBreadcrumb),
  // computed by the parent since it already holds the folders list — empty
  // for a note filed at the root, which renders nothing.
  breadcrumb?: string[];
  // True exactly once, right after a quick-create — the title input
  // auto-focuses with "Untitled" pre-selected so typing immediately
  // replaces it, then the parent clears this via onTitleFocused so it
  // doesn't refocus on later unrelated re-renders.
  autoFocusTitle?: boolean;
  onTitleFocused?: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  // Hands the parent a way to force any pending (debounced) autosave to
  // happen immediately — called on every render so the parent always holds
  // the latest closure. Used by NotesPageContent's "Upload to portal" flow:
  // exporting this note while it's the one currently open and mid-edit would
  // otherwise export whatever was last autosaved up to 1.2s ago, silently
  // missing the most recent keystrokes.
  onFlushRef?: (flush: () => Promise<void>) => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [icon, setIcon] = useState(note.icon);
  const [teamId, setTeamId] = useState(note.teamId ?? "");
  const [meetingAt, setMeetingAt] = useState(note.meetingAt ? toLocalInputValue(note.meetingAt) : "");
  const [content, setContent] = useState(note.content);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "saved">("idle");
  const [deleting, setDeleting] = useState(false);
  const [metaOpen, setMetaOpen] = useState(false);
  const { show } = useToast();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metaRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const latestRef = useRef({ title, teamId, meetingAt, content });
  useEffect(() => {
    latestRef.current = { title, teamId, meetingAt, content };
  });

  useEffect(() => {
    if (!autoFocusTitle) return;
    titleRef.current?.focus();
    titleRef.current?.select();
    onTitleFocused?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getTagCatalogAction().then((catalog) => setTeams(catalog.teams));
  }, []);

  useEffect(() => {
    if (!metaOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (metaRef.current && !metaRef.current.contains(e.target as Node)) setMetaOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [metaOpen]);

  async function flush() {
    const v = latestRef.current;
    const result = await updatePersonalNoteAction(note.id, {
      title: v.title,
      teamId: v.teamId || null,
      meetingAt: v.meetingAt ? new Date(v.meetingAt).toISOString() : null,
      content: v.content,
    });
    if (result.error) {
      show(result.error, "error");
      return;
    }
    setSaveState("saved");
    // Parent's note list was fetched once on mount and never refreshed —
    // without this, switching away and back re-hydrates the editor from
    // that stale list, making a genuinely-saved edit look like it reverted.
    onSaved();
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
  }, [note.id]);

  async function handleDelete() {
    setDeleting(true);
    const result = await deletePersonalNoteAction(note.id);
    setDeleting(false);
    if (result.error) {
      show(result.error, "error");
      return;
    }
    onDeleted();
  }

  // Icon changes save immediately (not debounced) — a discrete, deliberate
  // pick from the picker, not incremental typing, so there's no reason to
  // wait the usual autosave delay before it's persisted.
  async function handleSetIcon(next: string | null) {
    setIcon(next);
    const result = await updatePersonalNoteAction(note.id, { icon: next });
    if (result.error) {
      show(result.error, "error");
      return;
    }
    onSaved();
  }

  const teamName = teams?.find((t) => t.id === teamId)?.name;
  const metaLabel = [meetingAt ? formatMetaDate(meetingAt) : null, teamName].filter(Boolean).join(" · ");

  // Same centered-column shape as TeamNoteEditor.tsx — a fixed max-width
  // column with equal left/right margins, not a fixed-but-unequal padding —
  // so the two note types read as one consistent product instead of two
  // differently-proportioned editors. No FloatingComments margin to reserve
  // room for here (personal notes have no comments), so this is the plain
  // form of that same layout, not the width-constrained one.
  const contentStyle: React.CSSProperties = {
    maxWidth: 760,
    marginLeft: "auto",
    marginRight: "auto",
    paddingLeft: 40,
    paddingRight: 40,
  };

  return (
    <div className="relative h-full overflow-y-auto" data-notes-scroll-container>
      <div className="absolute top-6 right-6 z-30 flex items-center gap-2">
        <span className="shrink-0 text-xs text-neutral-400">
          {saveState === "pending" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
        </span>
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleting}
          className="shrink-0 text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </div>

      <div className="py-8" style={contentStyle} data-notes-content-column>
        <NoteBreadcrumb path={breadcrumb ?? []} />
        {/* "Add icon" only appears on hovering the title block specifically
            — scoped to just this wrapper (icon row + title input), not the
            whole content column, since that column's own height is
            stretched by RichTextEditor's min-h-[65vh] descendant and would
            otherwise make "hovering anywhere in the note body" count as
            "hovering the title" too. Once an icon is actually set it's
            always shown (large, permanent), same as Notion's own
            icon-vs-placeholder split. Plain (unnamed) group/group-hover,
            matching the only other hover-reveal pattern already used in
            this codebase (NoteFolderTree.tsx's row menus) — named groups
            (group/title + group-hover/title:) silently didn't apply here,
            not worth chasing further when the plain form already works. */}
        <div className="group">
          <div className={icon ? "mb-1" : "mb-1 opacity-0 transition-opacity group-hover:opacity-100"}>
            <IconPickerButton
              icon={icon}
              fallback={<TitleIconPlaceholder />}
              onSelect={handleSetIcon}
              onClear={() => handleSetIcon(null)}
              size={icon ? "lg" : "md"}
              label={icon ? undefined : "Add icon"}
            />
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
            {metaLabel || "Add date or team…"}
          </button>

          {metaOpen && (
            <div className="absolute top-full left-0 z-20 mt-2 flex w-80 gap-3 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold text-neutral-500">Meeting date/time</label>
                <DateTimePicker
                  value={meetingAt}
                  onChange={(v) => {
                    setMeetingAt(v);
                    scheduleSave();
                  }}
                />
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-semibold text-neutral-500">Team</label>
                <select
                  value={teamId}
                  onChange={(e) => {
                    setTeamId(e.target.value);
                    scheduleSave();
                  }}
                  className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
                >
                  <option value="">None</option>
                  {teams?.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        <RichTextEditor
          content={content}
          onChange={(html) => {
            setContent(html);
            scheduleSave();
          }}
          placeholder="Write your notes…"
        />
      </div>
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

function toLocalInputValue(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Matches DateTimePicker's own display format (DD-MM-YYYY HH:mm) so the
// subtitle line and the picker read consistently.
function formatMetaDate(localValue: string): string {
  const [datePart, timePart] = localValue.split("T");
  if (!datePart || !timePart) return localValue;
  const [y, m, d] = datePart.split("-");
  return `${d}-${m}-${y} ${timePart}`;
}

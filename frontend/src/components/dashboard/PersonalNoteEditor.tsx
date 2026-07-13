"use client";

import { useEffect, useRef, useState } from "react";
import { getTagCatalogAction } from "@/app/dashboard/documents-actions";
import { updatePersonalNoteAction, deletePersonalNoteAction } from "@/app/dashboard/notes-actions";
import type { PersonalNote, Team } from "@/lib/api";
import { RichTextEditor } from "@/components/dashboard/RichTextEditor";
import { useToast } from "@/components/ToastProvider";

const AUTOSAVE_DELAY_MS = 1200;

// A private, per-user note — visible only to its creator, not even Admins.
// teamId here is purely a filing label (which team this note is "about"),
// with no access implication at all. Rendered inline in the right-hand pane
// (parent passes key={note.id} so switching notes remounts fresh state
// rather than carrying stale values over).
export function PersonalNoteEditor({
  note,
  onSaved,
  onDeleted,
}: {
  note: PersonalNote;
  onSaved: () => void;
  onDeleted: () => void;
}) {
  const [title, setTitle] = useState(note.title);
  const [teamId, setTeamId] = useState(note.teamId ?? "");
  const [meetingAt, setMeetingAt] = useState(note.meetingAt ? toLocalInputValue(note.meetingAt) : "");
  const [content, setContent] = useState(note.content);
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "saved">("idle");
  const [deleting, setDeleting] = useState(false);
  const { show } = useToast();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({ title, teamId, meetingAt, content });
  useEffect(() => {
    latestRef.current = { title, teamId, meetingAt, content };
  });

  useEffect(() => {
    getTagCatalogAction().then((catalog) => setTeams(catalog.teams));
  }, []);

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

  return (
    <div className="flex h-full flex-col p-6">
      <div className="mb-3 flex items-center justify-between">
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleSave();
          }}
          className="w-full text-xl font-semibold text-neutral-900 focus:outline-none"
          placeholder="Note title"
        />
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-xs text-neutral-400">
            {saveState === "pending" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
          </span>
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="text-xs font-medium text-red-600 hover:underline disabled:opacity-60"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>

      <div className="mb-4 flex gap-3">
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold text-neutral-500">Meeting date/time</label>
          <input
            type="datetime-local"
            value={meetingAt}
            onChange={(e) => {
              setMeetingAt(e.target.value);
              scheduleSave();
            }}
            className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-semibold text-neutral-500">Team (optional label)</label>
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

      <div className="min-h-0 flex-1 overflow-y-auto">
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

function toLocalInputValue(isoString: string): string {
  const d = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

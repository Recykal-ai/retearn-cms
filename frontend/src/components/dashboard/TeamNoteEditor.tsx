"use client";

import { useEffect, useRef, useState } from "react";
import {
  getTeamNoteAction,
  updateTeamNoteAction,
  addTeamNoteMemberAction,
  removeTeamNoteMemberAction,
  searchCandidateUsersAction,
} from "@/app/dashboard/notes-actions";
import type { TeamNoteDetail, CandidateUser } from "@/lib/api";
import { RichTextEditor } from "@/components/dashboard/RichTextEditor";
import { DateTimePicker } from "@/components/dashboard/DateTimePicker";
import { useToast } from "@/components/ToastProvider";

const AUTOSAVE_DELAY_MS = 1200;

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
export function TeamNoteEditor({ noteId }: { noteId: string }) {
  const [detail, setDetail] = useState<TeamNoteDetail | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  const [metaOpen, setMetaOpen] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "pending" | "saved">("idle");
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<CandidateUser[]>([]);
  const { show } = useToast();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const metaRef = useRef<HTMLDivElement>(null);
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
      setContent(d.content);
      setMeetingAt(d.meetingAt ? toLocalInputValue(d.meetingAt) : "");
      setSaveState("idle");
    });
    return () => {
      cancelled = true;
    };
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
  }, [noteId]);

  async function handleAddMember(userId: string) {
    const result = await addTeamNoteMemberAction(noteId, userId);
    if (result.error) {
      show(result.error, "error");
      return;
    }
    setDetail(await getTeamNoteAction(noteId));
    setQuery("");
  }

  async function handleRemoveMember(userId: string) {
    const result = await removeTeamNoteMemberAction(noteId, userId);
    if (result.error) {
      show(result.error, "error");
      return;
    }
    setDetail(await getTeamNoteAction(noteId));
  }

  if (!detail) {
    return <p className="flex h-full items-center justify-center text-sm text-neutral-400">Loading…</p>;
  }

  const mentionCandidates = detail.members.map((m) => ({ id: m.id, label: m.name }));

  return (
    <div className="flex h-full">
      <div className="flex min-w-0 flex-1 flex-col p-6">
        <div className="mb-1 flex items-center justify-between">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              scheduleSave();
            }}
            className="w-full text-3xl font-bold text-neutral-900 focus:outline-none"
            placeholder="Note title"
          />
          <span className="shrink-0 text-xs text-neutral-400">
            {saveState === "pending" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
          </span>
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

        <div className="min-h-0 flex-1 overflow-y-auto">
          <RichTextEditor
            content={content}
            onChange={(html) => {
              setContent(html);
              scheduleSave();
            }}
            mentionCandidates={mentionCandidates}
            placeholder="Type @ to mention someone…"
          />
        </div>
      </div>

      <div className="w-56 shrink-0 overflow-y-auto border-l border-neutral-100 p-4">
        <p className="mb-2 text-xs font-semibold tracking-wide text-neutral-400 uppercase">Members</p>
        <ul className="mb-3 space-y-1">
          {detail.members.map((m) => (
            <li key={m.id} className="group flex items-center justify-between gap-1">
              <span className="truncate text-sm text-neutral-700">{m.name}</span>
              {detail.canCurate && (
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
          ))}
        </ul>

        {detail.canCurate && (
          <div>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Add someone…"
              className="mb-1.5 w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs focus:border-neutral-400 focus:outline-none"
            />
            <ul className="max-h-40 space-y-0.5 overflow-y-auto">
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
    </div>
  );
}

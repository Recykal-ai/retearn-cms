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
import { useToast } from "@/components/ToastProvider";

const AUTOSAVE_DELAY_MS = 1200;

// A titled, shared note for one team — the note list only ever shows notes
// the current user is already a member of, so this component never needs to
// handle a "not a member yet" state; membership is a precondition for it
// rendering at all.
export function TeamNoteEditor({ noteId }: { noteId: string }) {
  const [detail, setDetail] = useState<TeamNoteDetail | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [saveState, setSaveState] = useState<"idle" | "pending" | "saved">("idle");
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<CandidateUser[]>([]);
  const { show } = useToast();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestRef = useRef({ title, content });
  useEffect(() => {
    latestRef.current = { title, content };
  });

  useEffect(() => {
    let cancelled = false;
    getTeamNoteAction(noteId).then((d) => {
      if (cancelled) return;
      setDetail(d);
      setTitle(d.title);
      setContent(d.content);
      setSaveState("idle");
    });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

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
    const result = await updateTeamNoteAction(noteId, { title: v.title, content: v.content });
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
            className="w-full text-xl font-semibold text-neutral-900 focus:outline-none"
            placeholder="Note title"
          />
          <span className="shrink-0 text-xs text-neutral-400">
            {saveState === "pending" ? "Saving…" : saveState === "saved" ? "Saved" : ""}
          </span>
        </div>
        <p className="mb-4 text-xs text-neutral-400">
          {detail.teamName}
          {detail.meetingAt && ` · ${new Date(detail.meetingAt).toLocaleString()}`}
        </p>

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

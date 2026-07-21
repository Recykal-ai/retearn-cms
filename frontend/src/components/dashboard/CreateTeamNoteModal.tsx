"use client";

import { useEffect, useState } from "react";
import { getCreatableTeamsAction, createTeamNoteAction, searchCandidateUsersForTeamAction } from "@/app/dashboard/notes-actions";
import type { CreatableTeam, CandidateUser } from "@/lib/api";
import { DateTimePicker } from "@/components/dashboard/DateTimePicker";
import { useToast } from "@/components/ToastProvider";

// Admin/Super-Admin-only. Title + date/time + members, in one step — the
// creator is always included server-side regardless of whether they toggle
// themselves, so there's never a "created but I can't see it" moment.
//
// No folder field: which team/folder this note lands in is never a picker
// here — it's implied by *how* the modal was opened. Triggered from the
// root "New note" action, it's Team-picker + root (lockedTeamId/
// lockedFolderId both unset). Triggered from a folder row's own "+", the
// team and folder are already known from that row, so both are locked and
// the modal only asks what still needs a real decision: title, date,
// members.
export function CreateTeamNoteModal({
  lockedTeamId,
  lockedTeamName,
  lockedFolderId,
  onClose,
  onCreated,
}: {
  lockedTeamId?: string;
  lockedTeamName?: string;
  lockedFolderId?: string | null;
  onClose: () => void;
  onCreated: (noteId: string) => void;
}) {
  const [teams, setTeams] = useState<CreatableTeam[] | null>(null);
  const [teamId, setTeamId] = useState(lockedTeamId ?? "");
  const [title, setTitle] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<CandidateUser[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(false);
  const { show } = useToast();

  useEffect(() => {
    if (lockedTeamId) return;
    getCreatableTeamsAction().then((list) => {
      setTeams(list);
      if (list[0]) setTeamId(list[0].id);
    });
  }, [lockedTeamId]);

  useEffect(() => {
    if (!teamId) return;
    let cancelled = false;
    searchCandidateUsersForTeamAction(teamId, query).then((c) => {
      if (!cancelled) setCandidates(c);
    });
    return () => {
      cancelled = true;
    };
  }, [teamId, query]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate() {
    if (!teamId) {
      show("Pick a team.", "error");
      return;
    }
    if (!title.trim()) {
      show("Give the note a title.", "error");
      return;
    }
    setCreating(true);
    const result = await createTeamNoteAction({
      teamId,
      title: title.trim(),
      folderId: lockedFolderId ?? null,
      meetingAt: meetingAt ? new Date(meetingAt).toISOString() : null,
      memberIds: [...selectedIds],
    });
    setCreating(false);
    if (result.error || !result.id) {
      show(result.error ?? "Failed to create team note", "error");
      return;
    }
    onCreated(result.id);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      style={{ fontFamily: "var(--font-ui)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-900">New team note</h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-xl leading-none text-neutral-400 hover:text-neutral-600"
          >
            ×
          </button>
        </div>

        {lockedTeamId ? (
          <p className="mb-4 text-sm text-neutral-500">
            Creating in <span className="font-medium text-neutral-700">{lockedTeamName}</span>
          </p>
        ) : (
          <div className="mb-4">
            <label className="mb-1 block text-xs font-semibold text-neutral-500">Team</label>
            <select
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value);
                setSelectedIds(new Set());
              }}
              className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
            >
              {teams === null && <option>Loading…</option>}
              {teams?.length === 0 && <option>No teams you manage</option>}
              {teams?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold text-neutral-500">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Sprint Planning"
            autoFocus
            className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold text-neutral-500">Date/time</label>
          <DateTimePicker value={meetingAt} onChange={setMeetingAt} />
        </div>

        <div className="mb-5">
          <label className="mb-1.5 block text-xs font-semibold text-neutral-500">Add people</label>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people…"
            className="mb-2 w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
          />
          <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border border-neutral-100 p-1">
            {candidates.map((c) => (
              <li key={c.id}>
                <label className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm text-neutral-700 hover:bg-neutral-50">
                  <span className="truncate">{c.name}</span>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggle(c.id)}
                    className="shrink-0"
                  />
                </label>
              </li>
            ))}
            {candidates.length === 0 && <li className="px-2 py-1.5 text-xs text-neutral-400">No matches.</li>}
          </ul>
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={creating || !teamId}
            className="rounded-md px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--brand-purple)" }}
          >
            {creating ? "Creating…" : "Create & open"}
          </button>
        </div>
      </div>
    </div>
  );
}

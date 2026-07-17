"use client";

import { useEffect, useState } from "react";
import { getTagCatalogAction } from "@/app/dashboard/documents-actions";
import { createPersonalNoteAction } from "@/app/dashboard/notes-actions";
import type { Team } from "@/lib/api";
import { DateTimePicker } from "@/components/dashboard/DateTimePicker";
import { buildFolderOptions, type TreeFolder } from "@/components/dashboard/NoteFolderTree";
import { useToast } from "@/components/ToastProvider";

// Title/team/date up front, in one step — mirrors CreateTeamNoteModal's
// shape so both note types share the same creation pattern. Content starts
// empty; the note opens straight into PersonalNoteEditor afterward for that.
export function CreatePersonalNoteModal({
  folders,
  initialFolderId,
  onClose,
  onCreated,
}: {
  folders: TreeFolder[];
  initialFolderId?: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [teams, setTeams] = useState<Team[] | null>(null);
  const [title, setTitle] = useState("");
  const [teamId, setTeamId] = useState("");
  const [folderId, setFolderId] = useState(initialFolderId ?? "");
  const [meetingAt, setMeetingAt] = useState("");
  const [creating, setCreating] = useState(false);
  const { show } = useToast();

  useEffect(() => {
    getTagCatalogAction().then((catalog) => setTeams(catalog.teams));
  }, []);

  const folderOptions = buildFolderOptions(folders);

  async function handleCreate() {
    if (!title.trim()) {
      show("Give the note a title.", "error");
      return;
    }
    setCreating(true);
    const result = await createPersonalNoteAction({
      title: title.trim(),
      teamId: teamId || null,
      folderId: folderId || null,
      meetingAt: meetingAt ? new Date(meetingAt).toISOString() : null,
      content: "",
    });
    setCreating(false);
    if (result.error) {
      show(result.error, "error");
      return;
    }
    onCreated();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      style={{ fontFamily: "var(--font-ui)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-900">New note</h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-xl leading-none text-neutral-400 hover:text-neutral-600"
          >
            ×
          </button>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold text-neutral-500">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="e.g. 1:1 notes"
            autoFocus
            className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
          />
        </div>

        <div className="mb-5 flex gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-neutral-500">Meeting date/time</label>
            <DateTimePicker value={meetingAt} onChange={setMeetingAt} />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-semibold text-neutral-500">Team (optional label)</label>
            <select
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
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

        <div className="mb-5">
          <label className="mb-1 block text-xs font-semibold text-neutral-500">Folder (optional)</label>
          <select
            value={folderId}
            onChange={(e) => setFolderId(e.target.value)}
            className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
          >
            <option value="">Root</option>
            {folderOptions.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
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
            disabled={creating}
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

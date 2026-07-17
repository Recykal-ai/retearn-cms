"use client";

import { useState } from "react";
import { createPersonalNoteFolderAction, createTeamNoteFolderAction } from "@/app/dashboard/notes-actions";
import { buildFolderOptions, type TreeFolder } from "@/components/dashboard/NoteFolderTree";
import type { CreatableTeam, TeamNoteFolder } from "@/lib/api";
import { useToast } from "@/components/ToastProvider";

// Mirrors CreatePersonalNoteModal/CreateTeamNoteModal's shape (title/select
// fields, Cancel + primary action) so folder creation feels like the same
// pattern as note creation, just one field simpler.
export function CreateFolderModal({
  mode,
  personalFolders,
  teamFolders,
  creatableTeams,
  onClose,
  onCreated,
}: {
  mode: "individual" | "team";
  personalFolders?: TreeFolder[];
  teamFolders?: TeamNoteFolder[]; // every team's folders — filtered by the chosen team below
  creatableTeams?: CreatableTeam[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [teamId, setTeamId] = useState(creatableTeams?.[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const { show } = useToast();

  const options = buildFolderOptions(
    mode === "team" ? (teamFolders ?? []).filter((f) => f.teamId === teamId) : (personalFolders ?? []),
  );

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      show("Give the folder a name.", "error");
      return;
    }
    if (mode === "team" && !teamId) {
      show("Pick a team.", "error");
      return;
    }
    setCreating(true);
    const result =
      mode === "individual"
        ? await createPersonalNoteFolderAction({ name: trimmed, parentId: parentId || null })
        : await createTeamNoteFolderAction({ teamId, name: trimmed, parentId: parentId || null });
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
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-900">New folder</h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-xl leading-none text-neutral-400 hover:text-neutral-600"
          >
            ×
          </button>
        </div>

        {mode === "team" && (
          <div className="mb-4">
            <label className="mb-1 block text-xs font-semibold text-neutral-500">Team</label>
            <select
              value={teamId}
              onChange={(e) => {
                setTeamId(e.target.value);
                setParentId("");
              }}
              className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
            >
              {(creatableTeams?.length ?? 0) === 0 && <option>No teams you manage</option>}
              {creatableTeams?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mb-4">
          <label className="mb-1 block text-xs font-semibold text-neutral-500">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="e.g. Meeting notes"
            autoFocus
            className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
          />
        </div>

        <div className="mb-5">
          <label className="mb-1 block text-xs font-semibold text-neutral-500">Inside (optional)</label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="w-full rounded-md border border-neutral-200 px-2.5 py-1.5 text-sm focus:border-neutral-400 focus:outline-none"
          >
            <option value="">Root</option>
            {options.map((o) => (
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
            {creating ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

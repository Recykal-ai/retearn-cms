"use client";

import { useEffect, useState } from "react";
import {
  getPersonalNotesAction,
  getTeamNotesListAction,
  getNotificationsAction,
  markNotificationReadAction,
} from "@/app/dashboard/notes-actions";
import type { PersonalNote, TeamNoteSummary, NotificationEntry } from "@/lib/api";
import { PersonalNoteEditor } from "@/components/dashboard/PersonalNoteEditor";
import { TeamNoteEditor } from "@/components/dashboard/TeamNoteEditor";
import { CreateTeamNoteModal } from "@/components/dashboard/CreateTeamNoteModal";
import { CreatePersonalNoteModal } from "@/components/dashboard/CreatePersonalNoteModal";
import { relativeTime } from "@/lib/relative-time";

type Mode = "individual" | "team";

// Apple-Notes-style master-detail layout: a persistent left list + a right
// pane that shows whatever's selected, inline (no modal covering the list).
export function NotesPageContent({ isAdmin }: { isAdmin: boolean }) {
  const [mode, setMode] = useState<Mode>("individual");
  const [personalNotes, setPersonalNotes] = useState<PersonalNote[] | null>(null);
  const [teamNotes, setTeamNotes] = useState<TeamNoteSummary[] | null>(null);
  const [notifications, setNotifications] = useState<NotificationEntry[] | null>(null);
  const [selectedPersonalId, setSelectedPersonalId] = useState<string | null>(null);
  const [selectedTeamNoteId, setSelectedTeamNoteId] = useState<string | null>(null);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showCreatePersonalModal, setShowCreatePersonalModal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getPersonalNotesAction().then((notes) => {
      if (!cancelled) setPersonalNotes(notes);
    });
    getTeamNotesListAction().then((notes) => {
      if (!cancelled) setTeamNotes(notes);
    });
    getNotificationsAction().then((n) => {
      if (!cancelled) setNotifications(n);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleOpenNotification(n: NotificationEntry) {
    await markNotificationReadAction(n.id);
    setNotifications((prev) => prev?.map((x) => (x.id === n.id ? { ...x, read: true } : x)) ?? null);
    setMode("team");
    setSelectedTeamNoteId(n.teamNoteId);
  }

  async function handlePersonalNoteCreated() {
    setShowCreatePersonalModal(false);
    const notes = await getPersonalNotesAction();
    setPersonalNotes(notes);
    if (notes[0]) setSelectedPersonalId(notes[0].id);
  }

  function handleTeamNoteCreated(noteId: string) {
    setShowCreateTeamModal(false);
    getTeamNotesListAction().then(setTeamNotes);
    setSelectedTeamNoteId(noteId);
  }

  const unreadNotifications = notifications?.filter((n) => !n.read) ?? [];
  const selectedPersonal = personalNotes?.find((n) => n.id === selectedPersonalId) ?? null;

  return (
    <div className="flex h-full" style={{ fontFamily: "var(--font-ui)" }}>
      <div className="flex w-80 shrink-0 flex-col border-r border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 p-4">
          <div className="mb-3 inline-flex rounded-full bg-neutral-100 p-0.5 text-sm font-medium">
            <button
              type="button"
              onClick={() => setMode("individual")}
              className="rounded-full px-4 py-1.5 text-center transition-colors"
              style={mode === "individual" ? { background: "white", color: "#171717", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } : { color: "#737373" }}
            >
              Individual
            </button>
            <button
              type="button"
              onClick={() => setMode("team")}
              className="rounded-full px-4 py-1.5 text-center transition-colors"
              style={mode === "team" ? { background: "white", color: "#171717", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } : { color: "#737373" }}
            >
              Team
            </button>
          </div>

          {mode === "individual" && (
            <button
              type="button"
              onClick={() => setShowCreatePersonalModal(true)}
              className="w-full rounded-md px-3 py-1.5 text-sm font-medium text-white"
              style={{ background: "var(--brand-purple)" }}
            >
              + New note
            </button>
          )}
          {mode === "team" && isAdmin && (
            <button
              type="button"
              onClick={() => setShowCreateTeamModal(true)}
              className="w-full rounded-md px-3 py-1.5 text-sm font-medium text-white"
              style={{ background: "var(--brand-purple)" }}
            >
              + Create team note
            </button>
          )}
        </div>

        {unreadNotifications.length > 0 && (
          <div className="border-b border-neutral-100 bg-neutral-50 p-3">
            <p className="mb-1.5 text-xs font-semibold tracking-wide text-neutral-400 uppercase">Mentions</p>
            <ul className="space-y-1">
              {unreadNotifications.slice(0, 4).map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => handleOpenNotification(n)}
                    className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-neutral-700 hover:bg-white"
                  >
                    <span className="font-medium">{n.triggeredBy.name}</span> mentioned you in{" "}
                    <span className="font-medium">{n.noteTitle}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          {mode === "individual" &&
            (personalNotes === null ? (
              <p className="p-4 text-sm text-neutral-400">Loading…</p>
            ) : personalNotes.length === 0 ? (
              <p className="p-4 text-sm text-neutral-400 italic">No notes yet — private to you only.</p>
            ) : (
              personalNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => setSelectedPersonalId(note.id)}
                  className="block w-full border-b border-neutral-50 px-4 py-3 text-left"
                  style={note.id === selectedPersonalId ? { background: "var(--brand-purple-tint)" } : undefined}
                >
                  <span className="block truncate text-sm font-medium text-neutral-800">{note.title}</span>
                  <span className="block text-xs text-neutral-400" suppressHydrationWarning>
                    {relativeTime(note.updatedAt)}
                    {note.team ? ` · ${note.team.name}` : ""}
                  </span>
                </button>
              ))
            ))}

          {mode === "team" &&
            (teamNotes === null ? (
              <p className="p-4 text-sm text-neutral-400">Loading…</p>
            ) : teamNotes.length === 0 ? (
              <p className="p-4 text-sm text-neutral-400 italic">
                You haven&apos;t been added to any team notes yet.
              </p>
            ) : (
              teamNotes.map((note) => (
                <button
                  key={note.id}
                  type="button"
                  onClick={() => setSelectedTeamNoteId(note.id)}
                  className="block w-full border-b border-neutral-50 px-4 py-3 text-left"
                  style={note.id === selectedTeamNoteId ? { background: "var(--brand-purple-tint)" } : undefined}
                >
                  <span className="block truncate text-sm font-medium text-neutral-800">{note.title}</span>
                  <span className="block text-xs text-neutral-400" suppressHydrationWarning>
                    {relativeTime(note.updatedAt)} · {note.teamName}
                  </span>
                </button>
              ))
            ))}
        </div>
      </div>

      <div className="min-w-0 flex-1 bg-white">
        {mode === "individual" &&
          (selectedPersonal ? (
            <PersonalNoteEditor
              key={selectedPersonal.id}
              note={selectedPersonal}
              onSaved={() => getPersonalNotesAction().then(setPersonalNotes)}
              onDeleted={() => {
                setSelectedPersonalId(null);
                getPersonalNotesAction().then(setPersonalNotes);
              }}
            />
          ) : (
            <EmptyState label="Select a note, or create a new one." />
          ))}

        {mode === "team" &&
          (selectedTeamNoteId ? (
            <TeamNoteEditor key={selectedTeamNoteId} noteId={selectedTeamNoteId} />
          ) : (
            <EmptyState label="Select a team note to view it." />
          ))}
      </div>

      {showCreateTeamModal && (
        <CreateTeamNoteModal onClose={() => setShowCreateTeamModal(false)} onCreated={handleTeamNoteCreated} />
      )}
      {showCreatePersonalModal && (
        <CreatePersonalNoteModal onClose={() => setShowCreatePersonalModal(false)} onCreated={handlePersonalNoteCreated} />
      )}
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-neutral-400">{label}</p>
    </div>
  );
}

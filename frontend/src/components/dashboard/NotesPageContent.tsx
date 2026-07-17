"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  getPersonalNotesAction,
  getPersonalNoteFoldersAction,
  updatePersonalNoteFolderAction,
  deletePersonalNoteFolderAction,
  updatePersonalNoteAction,
  getTeamNotesListAction,
  getTeamNoteFoldersAction,
  getCreatableTeamsAction,
  updateTeamNoteFolderAction,
  deleteTeamNoteFolderAction,
  updateTeamNoteAction,
  getNotificationsAction,
  markNotificationReadAction,
} from "@/app/dashboard/notes-actions";
import type { PersonalNote, TeamNoteSummary, NotificationEntry, CreatableTeam, TeamNoteFolder } from "@/lib/api";
import { PersonalNoteEditor } from "@/components/dashboard/PersonalNoteEditor";
import { TeamNoteEditor } from "@/components/dashboard/TeamNoteEditor";
import { CreateTeamNoteModal } from "@/components/dashboard/CreateTeamNoteModal";
import { CreatePersonalNoteModal } from "@/components/dashboard/CreatePersonalNoteModal";
import { CreateFolderModal } from "@/components/dashboard/CreateFolderModal";
import { MoveToFolderModal } from "@/components/dashboard/MoveToFolderModal";
import { NoteFolderTree, type TreeFolder, type TreeNote } from "@/components/dashboard/NoteFolderTree";
import { useToast } from "@/components/ToastProvider";
import { relativeTime } from "@/lib/relative-time";

type Mode = "individual" | "team";

type MoveTarget =
  | { kind: "personal-note"; id: string; currentFolderId: string | null }
  | { kind: "personal-folder"; id: string; currentFolderId: string | null }
  | { kind: "team-note"; id: string; currentFolderId: string | null }
  | { kind: "team-folder"; id: string; currentFolderId: string | null };

// Apple-Notes-style master-detail layout: a persistent left list + a right
// pane that shows whatever's selected, inline (no modal covering the list).
// The left list is an Obsidian-style folder tree (NoteFolderTree) rather
// than a flat list — folders are purely organizational (see
// NoteFolderTree.tsx / the backend's personal-note-folders.ts and
// team-note-folders.ts), nested arbitrarily, admin/curator-gated for Team
// mode the same way team-note creation already was.
export function NotesPageContent({ isAdmin, currentUserId }: { isAdmin: boolean; currentUserId: string }) {
  const [mode, setMode] = useState<Mode>("individual");
  const [personalNotes, setPersonalNotes] = useState<PersonalNote[] | null>(null);
  const [personalFolders, setPersonalFolders] = useState<TreeFolder[] | null>(null);
  const [teamNotes, setTeamNotes] = useState<TeamNoteSummary[] | null>(null);
  const [teamFolders, setTeamFolders] = useState<TeamNoteFolder[] | null>(null);
  const [creatableTeams, setCreatableTeams] = useState<CreatableTeam[] | null>(null);
  const [notifications, setNotifications] = useState<NotificationEntry[] | null>(null);
  const [selectedPersonalId, setSelectedPersonalId] = useState<string | null>(null);
  const [selectedTeamNoteId, setSelectedTeamNoteId] = useState<string | null>(null);
  const [deepLinkCommentId, setDeepLinkCommentId] = useState<string | null>(null);
  const [showCreateTeamModal, setShowCreateTeamModal] = useState(false);
  const [showCreatePersonalModal, setShowCreatePersonalModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { show } = useToast();

  useEffect(() => {
    let cancelled = false;
    getPersonalNotesAction().then((notes) => {
      if (!cancelled) setPersonalNotes(notes);
    });
    getPersonalNoteFoldersAction().then((folders) => {
      if (!cancelled) setPersonalFolders(folders);
    });
    getTeamNotesListAction().then((notes) => {
      if (!cancelled) setTeamNotes(notes);
    });
    getTeamNoteFoldersAction().then((folders) => {
      if (!cancelled) setTeamFolders(folders);
    });
    getCreatableTeamsAction().then((teams) => {
      if (!cancelled) setCreatableTeams(teams);
    });
    getNotificationsAction().then((n) => {
      if (!cancelled) setNotifications(n);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // A "Copy link" on a comment (see CommentsSidePanel.tsx) points back here
  // with ?teamNote=&comment= — same one-time-param-then-strip pattern as
  // AutoOpenDocument.tsx's ?doc=.
  useEffect(() => {
    const teamNote = searchParams.get("teamNote");
    if (!teamNote) return;
    setMode("team");
    setSelectedTeamNoteId(teamNote);
    const comment = searchParams.get("comment");
    if (comment) setDeepLinkCommentId(comment);

    const next = new URLSearchParams(searchParams);
    next.delete("teamNote");
    next.delete("comment");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  function handleFolderCreated() {
    setShowCreateFolderModal(false);
    if (mode === "individual") getPersonalNoteFoldersAction().then(setPersonalFolders);
    else getTeamNoteFoldersAction().then(setTeamFolders);
  }

  async function handleRenamePersonalFolder(folder: TreeFolder, name: string) {
    const result = await updatePersonalNoteFolderAction(folder.id, { name });
    if (result.error) {
      show(result.error, "error");
      return;
    }
    getPersonalNoteFoldersAction().then(setPersonalFolders);
  }

  async function handleDeletePersonalFolder(folder: TreeFolder) {
    const result = await deletePersonalNoteFolderAction(folder.id);
    if (result.error) {
      show(result.error, "error");
      return;
    }
    getPersonalNoteFoldersAction().then(setPersonalFolders);
  }

  async function handleRenameTeamFolder(folder: TreeFolder, name: string) {
    const result = await updateTeamNoteFolderAction(folder.id, { name });
    if (result.error) {
      show(result.error, "error");
      return;
    }
    getTeamNoteFoldersAction().then(setTeamFolders);
  }

  async function handleDeleteTeamFolder(folder: TreeFolder) {
    const result = await deleteTeamNoteFolderAction(folder.id);
    if (result.error) {
      show(result.error, "error");
      return;
    }
    getTeamNoteFoldersAction().then(setTeamFolders);
  }

  const unreadNotifications = notifications?.filter((n) => !n.read) ?? [];
  const selectedPersonal = personalNotes?.find((n) => n.id === selectedPersonalId) ?? null;

  const personalTreeNotes: TreeNote[] = (personalNotes ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    folderId: n.folderId,
    updatedAt: n.updatedAt,
    subtitle: n.team?.name ?? "",
  }));
  const teamTreeNotes: TreeNote[] = (teamNotes ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    folderId: n.folderId,
    updatedAt: n.updatedAt,
    subtitle: n.teamName,
  }));

  // Client-side title search — both note lists are already fully loaded
  // (not paginated), so filtering here is instant and needs no backend
  // round trip, unlike the ILIKE-driven document search. Folder structure
  // is irrelevant to "find this note by name," so search results are a
  // flat, newest-first list rather than a filtered tree.
  const searchActive = searchQuery.trim().length > 0;
  const searchNeedle = searchQuery.trim().toLowerCase();
  function matchesSearch(notes: TreeNote[]): TreeNote[] {
    return notes
      .filter((n) => n.title.toLowerCase().includes(searchNeedle))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const personalSearchResults = searchActive ? matchesSearch(personalTreeNotes) : [];
  const teamSearchResults = searchActive ? matchesSearch(teamTreeNotes) : [];

  return (
    <div className="flex h-full" style={{ fontFamily: "var(--font-ui)" }}>
      <div className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
        <div className="border-b border-neutral-100 p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="inline-flex rounded-full bg-neutral-100 p-0.5 text-sm font-medium">
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
            <button
              type="button"
              onClick={() => {
                setSearchOpen((v) => {
                  const next = !v;
                  if (!next) setSearchQuery("");
                  return next;
                });
              }}
              aria-label={searchOpen ? "Close search" : "Search notes"}
              title="Search notes"
              className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
              style={searchOpen ? { background: "var(--brand-purple-tint)", color: "var(--brand-purple)" } : undefined}
            >
              <SearchIcon />
            </button>
          </div>

          {searchOpen && (
            <div className="relative mb-3">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    // Stopped here so it doesn't also bubble to
                    // CloseButton.tsx's window-level Escape listener, which
                    // would navigate out of Notes entirely instead of just
                    // closing the search box.
                    e.stopPropagation();
                    setSearchOpen(false);
                    setSearchQuery("");
                  }
                }}
                placeholder={mode === "individual" ? "Search your notes…" : "Search team notes…"}
                className="w-full rounded-md border border-neutral-200 py-1.5 pr-2.5 pl-8 text-sm focus:border-neutral-400 focus:outline-none"
              />
            </div>
          )}

          {!searchActive && (mode === "individual" || isAdmin) && (
            <div className="flex gap-1.5">
              <ToolbarButton
                label="New note"
                icon={<NewNoteIcon />}
                onClick={() => (mode === "individual" ? setShowCreatePersonalModal(true) : setShowCreateTeamModal(true))}
              />
              <ToolbarButton label="New folder" icon={<NewFolderIcon />} onClick={() => setShowCreateFolderModal(true)} />
            </div>
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
            (personalNotes === null || personalFolders === null ? (
              <p className="p-4 text-sm text-neutral-400">Loading…</p>
            ) : searchActive ? (
              <NoteSearchResults notes={personalSearchResults} selectedId={selectedPersonalId} onSelect={setSelectedPersonalId} query={searchQuery} />
            ) : (
              <NoteFolderTree
                folders={personalFolders}
                notes={personalTreeNotes}
                selectedNoteId={selectedPersonalId}
                onSelectNote={setSelectedPersonalId}
                canManage
                onRenameFolder={handleRenamePersonalFolder}
                onDeleteFolder={handleDeletePersonalFolder}
                onMoveFolder={(folder) => setMoveTarget({ kind: "personal-folder", id: folder.id, currentFolderId: folder.parentId })}
                onMoveNote={(note) => setMoveTarget({ kind: "personal-note", id: note.id, currentFolderId: note.folderId })}
                emptyLabel="No notes yet — private to you only."
              />
            ))}

          {mode === "team" &&
            (teamNotes === null || teamFolders === null ? (
              <p className="p-4 text-sm text-neutral-400">Loading…</p>
            ) : searchActive ? (
              <NoteSearchResults notes={teamSearchResults} selectedId={selectedTeamNoteId} onSelect={setSelectedTeamNoteId} query={searchQuery} />
            ) : (
              <NoteFolderTree
                folders={teamFolders}
                notes={teamTreeNotes}
                selectedNoteId={selectedTeamNoteId}
                onSelectNote={setSelectedTeamNoteId}
                canManage={isAdmin}
                onRenameFolder={handleRenameTeamFolder}
                onDeleteFolder={handleDeleteTeamFolder}
                onMoveFolder={(folder) => setMoveTarget({ kind: "team-folder", id: folder.id, currentFolderId: folder.parentId })}
                onMoveNote={(note) => setMoveTarget({ kind: "team-note", id: note.id, currentFolderId: note.folderId })}
                emptyLabel="You haven't been added to any team notes yet."
              />
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
            <TeamNoteEditor
              key={selectedTeamNoteId}
              noteId={selectedTeamNoteId}
              currentUserId={currentUserId}
              initialCommentId={deepLinkCommentId}
            />
          ) : (
            <EmptyState label="Select a team note to view it." />
          ))}
      </div>

      {showCreateTeamModal && (
        <CreateTeamNoteModal
          folders={teamFolders ?? []}
          onClose={() => setShowCreateTeamModal(false)}
          onCreated={handleTeamNoteCreated}
        />
      )}
      {showCreatePersonalModal && (
        <CreatePersonalNoteModal
          folders={personalFolders ?? []}
          onClose={() => setShowCreatePersonalModal(false)}
          onCreated={handlePersonalNoteCreated}
        />
      )}
      {showCreateFolderModal && (
        <CreateFolderModal
          mode={mode}
          personalFolders={personalFolders ?? []}
          teamFolders={teamFolders ?? []}
          creatableTeams={creatableTeams ?? []}
          onClose={() => setShowCreateFolderModal(false)}
          onCreated={handleFolderCreated}
        />
      )}
      {moveTarget && (
        <MoveToFolderModal
          title={moveTarget.kind.endsWith("folder") ? "Move folder" : "Move note"}
          folders={moveTarget.kind.startsWith("personal") ? personalFolders ?? [] : teamFolders ?? []}
          excludeSubtreeOf={moveTarget.kind.endsWith("folder") ? moveTarget.id : undefined}
          currentFolderId={moveTarget.currentFolderId}
          onClose={() => setMoveTarget(null)}
          onMove={async (targetFolderId) => {
            switch (moveTarget.kind) {
              case "personal-note": {
                const result = await updatePersonalNoteAction(moveTarget.id, { folderId: targetFolderId });
                if (!result.error) getPersonalNotesAction().then(setPersonalNotes);
                return result;
              }
              case "personal-folder": {
                const result = await updatePersonalNoteFolderAction(moveTarget.id, { parentId: targetFolderId });
                if (!result.error) getPersonalNoteFoldersAction().then(setPersonalFolders);
                return result;
              }
              case "team-note": {
                const result = await updateTeamNoteAction(moveTarget.id, { folderId: targetFolderId });
                if (!result.error) getTeamNotesListAction().then(setTeamNotes);
                return result;
              }
              case "team-folder": {
                const result = await updateTeamNoteFolderAction(moveTarget.id, { parentId: targetFolderId });
                if (!result.error) getTeamNoteFoldersAction().then(setTeamFolders);
                return result;
              }
            }
          }}
        />
      )}
    </div>
  );
}

function ToolbarButton({ label, icon, onClick }: { label: string; icon: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-md border border-neutral-200 text-neutral-500 hover:bg-neutral-50 hover:text-neutral-700"
    >
      {icon}
      <span className="text-xs font-medium">{label}</span>
    </button>
  );
}

function NewNoteIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 4.5h9.5L19 8v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9 10h6M9 13.5h6M9 17h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function NewFolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 6.5A1.5 1.5 0 0 1 5.5 5h4.4l1.8 2h7.3A1.5 1.5 0 0 1 20.5 8.5v9A1.5 1.5 0 0 1 19 19H5.5A1.5 1.5 0 0 1 4 17.5v-11Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M12 11.5v4M10 13.5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-sm text-neutral-400">{label}</p>
    </div>
  );
}

// Flat, newest-first — a search result cares about "which note is this,"
// not "which folder is it filed under," so it deliberately drops
// NoteFolderTree's nesting/indentation rather than trying to preserve it.
function NoteSearchResults({
  notes,
  selectedId,
  onSelect,
  query,
}: {
  notes: TreeNote[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  query: string;
}) {
  if (notes.length === 0) {
    return <p className="p-4 text-sm text-neutral-400 italic">No notes match &ldquo;{query.trim()}&rdquo;.</p>;
  }
  return (
    <div className="py-1">
      {notes.map((note) => (
        <button
          key={note.id}
          type="button"
          onClick={() => onSelect(note.id)}
          className="block w-full border-b border-neutral-50 px-4 py-3 text-left"
          style={note.id === selectedId ? { background: "var(--brand-purple-tint)" } : undefined}
        >
          <span className="block truncate text-sm font-medium text-neutral-800">{note.title}</span>
          <span className="block text-xs text-neutral-400" suppressHydrationWarning>
            {relativeTime(note.updatedAt)}
            {note.subtitle ? ` · ${note.subtitle}` : ""}
          </span>
        </button>
      ))}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

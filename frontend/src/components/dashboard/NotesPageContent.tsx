"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import {
  getPersonalNotesAction,
  createPersonalNoteAction,
  getPersonalNoteFoldersAction,
  createPersonalNoteFolderAction,
  updatePersonalNoteFolderAction,
  deletePersonalNoteFolderAction,
  updatePersonalNoteAction,
  deletePersonalNoteAction,
  getTeamNotesListAction,
  getTeamNoteFoldersAction,
  createTeamNoteFolderAction,
  getCreatableTeamsAction,
  updateTeamNoteFolderAction,
  deleteTeamNoteFolderAction,
  updateTeamNoteAction,
  deleteTeamNoteAction,
  getNotificationsAction,
  markNotificationReadAction,
  exportNoteToPortalAction,
} from "@/app/dashboard/notes-actions";
import type { PersonalNote, TeamNoteSummary, NotificationEntry, CreatableTeam, TeamNoteFolder, Team, Product, Category } from "@/lib/api";
import { PersonalNoteEditor } from "@/components/dashboard/PersonalNoteEditor";
import { TeamNoteEditor } from "@/components/dashboard/TeamNoteEditor";
import { CreateTeamNoteModal } from "@/components/dashboard/CreateTeamNoteModal";
import { MoveToFolderModal } from "@/components/dashboard/MoveToFolderModal";
import { UploadModal } from "@/components/dashboard/UploadModal";
import { NoteFolderTree, NoteIcon, FolderIcon, buildBreadcrumb, type TreeFolder, type TreeNote } from "@/components/dashboard/NoteFolderTree";
import { Icon } from "@/components/dashboard/Icon";
import { Tag } from "@/components/dashboard/Tag";
import { colorForScope } from "@/lib/tag-colors";
import { useToast } from "@/components/ToastProvider";

type Mode = "individual" | "team";

type MoveTarget =
  | { kind: "personal-note"; id: string; currentFolderId: string | null }
  | { kind: "personal-folder"; id: string; currentFolderId: string | null }
  | { kind: "team-note"; id: string; currentFolderId: string | null }
  | { kind: "team-folder"; id: string; currentFolderId: string | null };

// Which team-note-creation flow to open: root (team picker, no folder) or
// contextual (team + folder already known from whichever folder's "+" was
// clicked, so the modal only asks title/date/members).
type TeamNoteModalContext = { teamId?: string; teamName?: string; folderId?: string | null };

// Confluence/Notion-style master-detail layout: a persistent left tree + a
// right pane that shows whatever's selected. Creation is contextual — a
// folder's own "+" creates directly inside it, root-level creation comes
// from the bottom-pinned bar — never a modal asking "which folder." See
// NoteFolderTree.tsx for the tree itself.
export function NotesPageContent({
  isAdmin,
  currentUserId,
  teams,
  products,
  categoriesByScope,
}: {
  isAdmin: boolean;
  currentUserId: string;
  teams: Team[];
  products: Product[];
  categoriesByScope: Record<string, Category[]>;
}) {
  const [mode, setMode] = useState<Mode>("individual");
  // The note currently being exported via "Upload to portal" — drives the
  // controlled UploadModal below. kind distinguishes which export-pdf route
  // to hit (personal vs team note), set alongside title/id at the row-menu
  // click site since NoteFolderTree's own TreeNote shape doesn't carry it.
  const [exportTarget, setExportTarget] = useState<{ id: string; kind: "personal" | "team"; title: string } | null>(null);
  // Handed to us by whichever editor is currently mounted (PersonalNoteEditor/
  // TeamNoteEditor's onFlushRef prop), re-assigned on every one of their
  // renders so it always points at the current closure. Only the editor for
  // the currently-open note is relevant — exporting a different, unopened
  // note has nothing pending to flush, since its last edit was already saved
  // before the user navigated away from it.
  const personalFlushRef = useRef<(() => Promise<void>) | null>(null);
  const teamFlushRef = useRef<(() => Promise<void>) | null>(null);
  const [personalNotes, setPersonalNotes] = useState<PersonalNote[] | null>(null);
  const [personalFolders, setPersonalFolders] = useState<TreeFolder[] | null>(null);
  const [teamNotes, setTeamNotes] = useState<TeamNoteSummary[] | null>(null);
  const [teamFolders, setTeamFolders] = useState<TeamNoteFolder[] | null>(null);
  const [creatableTeams, setCreatableTeams] = useState<CreatableTeam[] | null>(null);
  const [notifications, setNotifications] = useState<NotificationEntry[] | null>(null);
  const [selectedPersonalId, setSelectedPersonalId] = useState<string | null>(null);
  const [selectedTeamNoteId, setSelectedTeamNoteId] = useState<string | null>(null);
  const [deepLinkCommentId, setDeepLinkCommentId] = useState<string | null>(null);
  const [teamNoteModalContext, setTeamNoteModalContext] = useState<TeamNoteModalContext | null>(null);
  const [moveTarget, setMoveTarget] = useState<MoveTarget | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  // Exact match against a note's subtitle (team name/label) — "" means no
  // filter. Combines with the text query rather than replacing it, so
  // "notes titled X, within team Y" is one search, not two separate steps.
  const [teamFilter, setTeamFilter] = useState("");
  // The note a quick-create just opened — its title input auto-focuses (and
  // selects "Untitled") exactly once, the same way a freshly created folder
  // auto-enters rename mode. Cleared as soon as it's been consumed so it
  // doesn't refocus on every unrelated re-render.
  const [focusTitleNoteId, setFocusTitleNoteId] = useState<string | null>(null);
  const [autoRenameFolderId, setAutoRenameFolderId] = useState<string | null>(null);
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

  // --- Personal: instant creation, no modal ---
  async function handleQuickCreatePersonalNote(folderId: string | null) {
    const result = await createPersonalNoteAction({ title: "Untitled", folderId });
    if (result.error || !result.id) {
      show(result.error ?? "Failed to create note", "error");
      return;
    }
    const notes = await getPersonalNotesAction();
    setPersonalNotes(notes);
    setSelectedPersonalId(result.id);
    setFocusTitleNoteId(result.id);
  }

  async function handleQuickCreatePersonalFolder(parentId: string | null) {
    const result = await createPersonalNoteFolderAction({ name: "Untitled", parentId });
    if (result.error || !result.id) {
      show(result.error ?? "Failed to create folder", "error");
      return;
    }
    getPersonalNoteFoldersAction().then(setPersonalFolders);
    setAutoRenameFolderId(result.id);
  }

  // --- Team: folders are instant too (once team/parent is known); notes
  // still go through CreateTeamNoteModal for the members step ---
  async function handleQuickCreateTeamFolder(teamId: string, parentId: string | null) {
    const result = await createTeamNoteFolderAction({ teamId, name: "Untitled", parentId });
    if (result.error || !result.id) {
      show(result.error ?? "Failed to create folder", "error");
      return;
    }
    getTeamNoteFoldersAction().then(setTeamFolders);
    setAutoRenameFolderId(result.id);
  }

  function handleTeamNoteCreated(noteId: string) {
    setTeamNoteModalContext(null);
    getTeamNotesListAction().then(setTeamNotes);
    setMode("team");
    setSelectedTeamNoteId(noteId);
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

  async function handleSetPersonalFolderIcon(folder: TreeFolder, icon: string | null) {
    const result = await updatePersonalNoteFolderAction(folder.id, { icon });
    if (result.error) {
      show(result.error, "error");
      return;
    }
    getPersonalNoteFoldersAction().then(setPersonalFolders);
  }

  async function handleSetPersonalNoteIcon(note: TreeNote, icon: string | null) {
    const result = await updatePersonalNoteAction(note.id, { icon });
    if (result.error) {
      show(result.error, "error");
      return;
    }
    getPersonalNotesAction().then(setPersonalNotes);
  }

  async function handleDeletePersonalNote(note: TreeNote) {
    const result = await deletePersonalNoteAction(note.id);
    if (result.error) {
      show(result.error, "error");
      return;
    }
    if (selectedPersonalId === note.id) setSelectedPersonalId(null);
    getPersonalNotesAction().then(setPersonalNotes);
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

  async function handleSetTeamFolderIcon(folder: TreeFolder, icon: string | null) {
    const result = await updateTeamNoteFolderAction(folder.id, { icon });
    if (result.error) {
      show(result.error, "error");
      return;
    }
    getTeamNoteFoldersAction().then(setTeamFolders);
  }

  async function handleSetTeamNoteIcon(note: TreeNote, icon: string | null) {
    const result = await updateTeamNoteAction(note.id, { icon });
    if (result.error) {
      show(result.error, "error");
      return;
    }
    getTeamNotesListAction().then(setTeamNotes);
  }

  async function handleDeleteTeamNote(note: TreeNote) {
    const result = await deleteTeamNoteAction(note.id);
    if (result.error) {
      show(result.error, "error");
      return;
    }
    if (selectedTeamNoteId === note.id) setSelectedTeamNoteId(null);
    getTeamNotesListAction().then(setTeamNotes);
  }

  const unreadNotifications = notifications?.filter((n) => !n.read) ?? [];
  const selectedPersonal = personalNotes?.find((n) => n.id === selectedPersonalId) ?? null;
  const personalBreadcrumb = selectedPersonal ? buildBreadcrumb(personalFolders ?? [], selectedPersonal.folderId) : [];
  const selectedTeamFolderId = teamNotes?.find((n) => n.id === selectedTeamNoteId)?.folderId ?? null;
  const teamBreadcrumb = selectedTeamNoteId ? buildBreadcrumb(teamFolders ?? [], selectedTeamFolderId) : [];

  const personalTreeNotes: TreeNote[] = (personalNotes ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    icon: n.icon,
    folderId: n.folderId,
    updatedAt: n.updatedAt,
    subtitle: n.team?.name ?? "",
  }));
  const teamTreeNotes: TreeNote[] = (teamNotes ?? []).map((n) => ({
    id: n.id,
    title: n.title,
    icon: n.icon,
    folderId: n.folderId,
    updatedAt: n.updatedAt,
    subtitle: n.teamName,
  }));

  // Client-side title search — both note lists are already fully loaded
  // (not paginated), so filtering here is instant and needs no backend
  // round trip, unlike the ILIKE-driven document search. Folder structure
  // is irrelevant to "find this note by name," so search results are a
  // flat, newest-first list rather than a filtered tree. The team filter
  // (subtitle exact-match) rides along on the same active/inactive state —
  // picking a team with no text typed is still "search," just unfiltered
  // by title, matching the ask to search notes "via the team" too.
  const searchActive = searchQuery.trim().length > 0 || teamFilter !== "";
  const searchNeedle = searchQuery.trim().toLowerCase();
  function matchesSearch(notes: TreeNote[]): TreeNote[] {
    return notes
      .filter((n) => n.title.toLowerCase().includes(searchNeedle))
      .filter((n) => !teamFilter || n.subtitle === teamFilter)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  const personalSearchResults = searchActive ? matchesSearch(personalTreeNotes) : [];
  const teamSearchResults = searchActive ? matchesSearch(teamTreeNotes) : [];
  const availableTeamFilters = [
    ...new Set((mode === "individual" ? personalTreeNotes : teamTreeNotes).map((n) => n.subtitle).filter(Boolean)),
  ].sort();

  const showCreateControls = mode === "individual" || isAdmin;

  return (
    <div className="flex h-full" style={{ fontFamily: "var(--font-ui)" }}>
      <div className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
        <div className="flex justify-center border-b border-neutral-100 p-3">
          <div className="inline-flex rounded-full bg-neutral-100 p-0.5 text-sm font-medium">
            <button
              type="button"
              onClick={() => {
                setMode("individual");
                setTeamFilter("");
              }}
              className="rounded-full px-4 py-1.5 text-center transition-colors"
              style={mode === "individual" ? { background: "white", color: "#171717", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } : { color: "#737373" }}
            >
              Individual
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("team");
                setTeamFilter("");
              }}
              className="rounded-full px-4 py-1.5 text-center transition-colors"
              style={mode === "team" ? { background: "white", color: "#171717", boxShadow: "0 1px 2px rgba(0,0,0,0.08)" } : { color: "#737373" }}
            >
              Team
            </button>
          </div>
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
                onDeleteNote={handleDeletePersonalNote}
                onSetFolderIcon={handleSetPersonalFolderIcon}
                onSetNoteIcon={handleSetPersonalNoteIcon}
                onCreateNoteInFolder={handleQuickCreatePersonalNote}
                onCreateSubfolder={handleQuickCreatePersonalFolder}
                onExportToPortal={async (note) => {
                  // If this note is the one currently open, its most recent
                  // edits may still be sitting in the 1.2s autosave debounce
                  // — flush them first so the export doesn't silently ship a
                  // stale version. See PersonalNoteEditor.tsx's onFlushRef.
                  if (note.id === selectedPersonalId) await personalFlushRef.current?.();
                  setExportTarget({ id: note.id, kind: "personal", title: note.title });
                }}
                autoRenameFolderId={autoRenameFolderId}
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
                onDeleteNote={handleDeleteTeamNote}
                onSetFolderIcon={handleSetTeamFolderIcon}
                onSetNoteIcon={handleSetTeamNoteIcon}
                onCreateNoteInFolder={(folderId) => {
                  const folder = teamFolders.find((f) => f.id === folderId);
                  if (!folder) return;
                  const teamName = creatableTeams?.find((t) => t.id === folder.teamId)?.name ?? "";
                  setTeamNoteModalContext({ teamId: folder.teamId, teamName, folderId: folder.id });
                }}
                onCreateSubfolder={(folderId) => {
                  const folder = teamFolders.find((f) => f.id === folderId);
                  if (!folder) return;
                  handleQuickCreateTeamFolder(folder.teamId, folder.id);
                }}
                onExportToPortal={async (note) => {
                  if (note.id === selectedTeamNoteId) await teamFlushRef.current?.();
                  setExportTarget({ id: note.id, kind: "team", title: note.title });
                }}
                autoRenameFolderId={autoRenameFolderId}
                emptyLabel="You haven't been added to any team notes yet."
              />
            ))}
        </div>

        <BottomBar
          mode={mode}
          showCreateControls={showCreateControls}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          teamFilter={teamFilter}
          onTeamFilterChange={setTeamFilter}
          availableTeamFilters={availableTeamFilters}
          creatableTeams={creatableTeams ?? []}
          onCreateNote={() => {
            if (mode === "individual") handleQuickCreatePersonalNote(null);
            else setTeamNoteModalContext({});
          }}
          onCreateFolder={(teamId) => {
            if (mode === "individual") handleQuickCreatePersonalFolder(null);
            else if (teamId) handleQuickCreateTeamFolder(teamId, null);
          }}
        />
      </div>

      <div className="min-w-0 flex-1 bg-white">
        {mode === "individual" &&
          (selectedPersonal ? (
            <PersonalNoteEditor
              key={selectedPersonal.id}
              note={selectedPersonal}
              breadcrumb={personalBreadcrumb}
              autoFocusTitle={selectedPersonal.id === focusTitleNoteId}
              onTitleFocused={() => setFocusTitleNoteId(null)}
              onSaved={() => getPersonalNotesAction().then(setPersonalNotes)}
              onDeleted={() => {
                setSelectedPersonalId(null);
                getPersonalNotesAction().then(setPersonalNotes);
              }}
              onFlushRef={(fn) => {
                personalFlushRef.current = fn;
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
              breadcrumb={teamBreadcrumb}
              initialCommentId={deepLinkCommentId}
              autoFocusTitle={selectedTeamNoteId === focusTitleNoteId}
              onTitleFocused={() => setFocusTitleNoteId(null)}
              onSaved={() => getTeamNotesListAction().then(setTeamNotes)}
              onDeleted={() => {
                setSelectedTeamNoteId(null);
                getTeamNotesListAction().then(setTeamNotes);
              }}
              onFlushRef={(fn) => {
                teamFlushRef.current = fn;
              }}
            />
          ) : (
            <EmptyState label="Select a team note to view it." />
          ))}
      </div>

      <UploadModal
        // Remounts on every new export target so its internal team/category
        // picks reset cleanly (React's own recommended alternative to an
        // effect-driven reset — see react.dev "resetting state with a key").
        key={exportTarget?.id ?? "closed"}
        teams={teams}
        products={products}
        categoriesByScope={categoriesByScope}
        action={exportNoteToPortalAction}
        open={!!exportTarget}
        onOpenChange={(o) => !o && setExportTarget(null)}
        sourceNote={exportTarget ?? undefined}
      />

      {teamNoteModalContext && (
        <CreateTeamNoteModal
          lockedTeamId={teamNoteModalContext.teamId}
          lockedTeamName={teamNoteModalContext.teamName}
          lockedFolderId={teamNoteModalContext.folderId}
          onClose={() => setTeamNoteModalContext(null)}
          onCreated={handleTeamNoteCreated}
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

// Pinned to the bottom of the sidebar: a persistent search pill + a compact
// "+" that opens a two-item create menu — replaces the old top toolbar
// (search toggle + two full-width buttons). No open/close state for search
// itself; it's always there, same as Notion's own sidebar footer.
function BottomBar({
  mode,
  showCreateControls,
  searchQuery,
  onSearchChange,
  teamFilter,
  onTeamFilterChange,
  availableTeamFilters,
  creatableTeams,
  onCreateNote,
  onCreateFolder,
}: {
  mode: Mode;
  showCreateControls: boolean;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  teamFilter: string;
  onTeamFilterChange: (team: string) => void;
  availableTeamFilters: string[];
  creatableTeams: CreatableTeam[];
  onCreateNote: () => void;
  onCreateFolder: (teamId?: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState<"root" | "pickTeam" | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const filterRef = useRef<HTMLDivElement>(null);
  const visibleTeamFilters = availableTeamFilters.filter((t) => t.toLowerCase().includes(filterQuery.trim().toLowerCase()));

  useEffect(() => {
    if (!menuOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!filterOpen) return;
    function onMouseDown(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [filterOpen]);

  function handleFolderClick() {
    if (mode === "individual" || creatableTeams.length === 1) {
      onCreateFolder(mode === "team" ? creatableTeams[0]?.id : undefined);
      setMenuOpen(null);
    } else {
      setMenuOpen("pickTeam");
    }
  }

  return (
    <div className="flex items-center gap-1.5 border-t border-neutral-100 p-2.5">
      <div className="relative min-w-0 flex-1">
        <Icon
          name="Interface/Search_Magnifying_Glass"
          size={14}
          className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400"
        />
        <input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && searchQuery) {
              // Stopped so it doesn't also bubble to CloseButton.tsx's
              // window-level Escape listener and navigate out of Notes.
              e.stopPropagation();
              onSearchChange("");
            }
          }}
          placeholder="Search"
          className="w-full rounded-full border border-neutral-200 bg-neutral-50 py-1.5 pr-3 pl-8 text-sm focus:border-neutral-300 focus:bg-white focus:outline-none"
        />
      </div>

      {availableTeamFilters.length > 0 && (
        <div ref={filterRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => {
              setFilterOpen((v) => !v);
              setFilterQuery("");
            }}
            aria-label="Filter by team"
            title="Filter by team"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-200 hover:bg-neutral-50"
            style={teamFilter ? { background: "var(--brand-purple-tint)", borderColor: "var(--brand-purple)", color: "var(--brand-purple)" } : { color: "#737373" }}
          >
            <Icon name="Interface/Filter" size={14} />
          </button>
          {filterOpen && (
            <div className="absolute bottom-full right-0 z-20 mb-1.5 w-48 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
              <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide text-neutral-400 uppercase">Filter by team</p>
              {/* Only worth the extra chrome once there's enough teams that
                  scanning the plain list stops being instant — with a
                  handful, the search box would just be dead space above an
                  already-short list. */}
              {availableTeamFilters.length > 6 && (
                <div className="px-2 pb-1">
                  <input
                    autoFocus
                    value={filterQuery}
                    onChange={(e) => setFilterQuery(e.target.value)}
                    placeholder="Search teams…"
                    className="w-full rounded-md border border-neutral-200 px-2 py-1 text-xs focus:border-neutral-400 focus:outline-none"
                  />
                </div>
              )}
              <div className="max-h-52 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    onTeamFilterChange("");
                    setFilterOpen(false);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
                  style={{ color: teamFilter === "" ? "var(--brand-purple)" : "#404040", fontWeight: teamFilter === "" ? 600 : 400 }}
                >
                  All teams
                </button>
                {visibleTeamFilters.map((team) => (
                  <button
                    key={team}
                    type="button"
                    onClick={() => {
                      onTeamFilterChange(team);
                      setFilterOpen(false);
                    }}
                    className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-neutral-50"
                    style={{ color: teamFilter === team ? "var(--brand-purple)" : "#404040", fontWeight: teamFilter === team ? 600 : 400 }}
                  >
                    {team}
                  </button>
                ))}
                {visibleTeamFilters.length === 0 && (
                  <p className="px-3 py-2 text-xs text-neutral-400">No teams match &ldquo;{filterQuery}&rdquo;.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {showCreateControls && (
        <div ref={menuRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => (v ? null : "root"))}
            aria-label="New note or folder"
            title="New note or folder"
            className="flex h-8 w-8 items-center justify-center rounded-full text-white"
            style={{ background: "var(--brand-purple)" }}
          >
            <Icon name="Edit/Add_Plus" size={16} />
          </button>
          {menuOpen && (
            <div className="absolute bottom-full right-0 z-20 mb-1.5 w-40 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
              {menuOpen === "root" ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      onCreateNote();
                      setMenuOpen(null);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    <NoteIcon />
                    New note
                  </button>
                  <button
                    type="button"
                    onClick={handleFolderClick}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                  >
                    <FolderIcon />
                    New folder
                  </button>
                </>
              ) : (
                <>
                  <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide text-neutral-400 uppercase">Team</p>
                  {creatableTeams.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        onCreateFolder(t.id);
                        setMenuOpen(null);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50"
                    >
                      {t.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
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
          className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left hover:bg-neutral-50"
          style={note.id === selectedId ? { background: "var(--brand-purple-tint)" } : undefined}
        >
          <span className="shrink-0 text-neutral-400">{note.icon ? <Icon name={note.icon} size={14} /> : <NoteIcon />}</span>
          <span className="min-w-0 truncate text-sm text-neutral-800">{note.title}</span>
          {note.subtitle && (
            <span className="shrink-0">
              <Tag label={note.subtitle} {...colorForScope(note.subtitle)} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}


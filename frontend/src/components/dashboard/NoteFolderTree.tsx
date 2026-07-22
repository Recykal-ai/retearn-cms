"use client";

import { useMemo, useRef, useState } from "react";
import { IconPickerButton } from "@/components/dashboard/IconPickerButton";
import { Icon } from "@/components/dashboard/Icon";
import { Tag } from "@/components/dashboard/Tag";
import { colorForScope } from "@/lib/tag-colors";

export interface TreeFolder {
  id: string;
  name: string;
  icon: string | null;
  parentId: string | null;
}

// Depth-first flattening of a folder list into <select>-friendly options,
// each label indented to show nesting — used by the move modal so picking a
// target folder looks like a tree even inside a plain <select>.
// `excludeSubtreeOf`, when given, drops that folder and all its descendants
// (moving a folder into its own descendant would create a cycle; the
// backend rejects it too, but filtering it out of the picker avoids the
// round-trip error for the common case).
export function buildFolderOptions(
  folders: TreeFolder[],
  excludeSubtreeOf?: string,
): { id: string; label: string }[] {
  const excluded = new Set<string>();
  if (excludeSubtreeOf) {
    excluded.add(excludeSubtreeOf);
    let changed = true;
    while (changed) {
      changed = false;
      for (const f of folders) {
        if (f.parentId && excluded.has(f.parentId) && !excluded.has(f.id)) {
          excluded.add(f.id);
          changed = true;
        }
      }
    }
  }

  const childrenOf = new Map<string | null, TreeFolder[]>();
  for (const f of folders) {
    if (excluded.has(f.id)) continue;
    const key = f.parentId;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(f);
  }

  const options: { id: string; label: string }[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const folder of childrenOf.get(parentId) ?? []) {
      options.push({ id: folder.id, label: `${"— ".repeat(depth)}${folder.name}` });
      walk(folder.id, depth + 1);
    }
  }
  walk(null, 0);
  return options;
}

// Root-first folder names for a note's `folderId`, e.g. ["Engineering",
// "Sprint notes"] for a note filed two levels deep — the note editors render
// this as a breadcrumb above the title. `null`/an id with no match (already
// deleted, or the note isn't in a folder) both just mean no breadcrumb.
export function buildBreadcrumb(folders: TreeFolder[], folderId: string | null): string[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: string[] = [];
  let current = folderId ? byId.get(folderId) : undefined;
  // Cycle guard — folder moves are validated server-side to reject cycles,
  // but a stale client-side folders list mid-move shouldn't be able to hang
  // the render in a loop.
  const seen = new Set<string>();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current.name);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
}

export interface TreeNote {
  id: string;
  title: string;
  icon: string | null;
  folderId: string | null;
  updatedAt: string;
  subtitle: string; // team name/label, shown as a small trailing badge
}

// Confluence/Notion-style nested tree: folders before notes at each level,
// folders alphabetical (already sorted that way by the backend), notes
// newest-first. Single-line, icon-forward rows — denser than the previous
// two-line Apple-Notes-style rows, with per-row hover actions (+ opens a
// New note/New subfolder picker, ⋯ for rename/move/delete) instead of
// requiring a separate creation modal with a parent-folder picker. Purely a
// renderer — all mutation goes through the callback props, called from
// NotesPageContent.tsx's server actions.
export function NoteFolderTree({
  folders,
  notes,
  selectedNoteId,
  onSelectNote,
  canManage,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
  onMoveNote,
  onDeleteNote,
  onSetFolderIcon,
  onSetNoteIcon,
  onCreateNoteInFolder,
  onCreateSubfolder,
  onExportToPortal,
  autoRenameFolderId,
  emptyLabel,
}: {
  folders: TreeFolder[];
  notes: TreeNote[];
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  canManage: boolean;
  onRenameFolder: (folder: TreeFolder, name: string) => void;
  onDeleteFolder: (folder: TreeFolder) => void;
  onMoveFolder: (folder: TreeFolder) => void;
  onMoveNote: (note: TreeNote) => void;
  onDeleteNote: (note: TreeNote) => void;
  onSetFolderIcon: (folder: TreeFolder, icon: string | null) => void;
  onSetNoteIcon: (note: TreeNote, icon: string | null) => void;
  onCreateNoteInFolder: (folderId: string) => void;
  onCreateSubfolder: (folderId: string) => void;
  // Opens the "Upload to portal" flow for a note (NotesPageContent.tsx) —
  // shown for every note row regardless of canManage, since any note member
  // can export (not just a curator/admin) — see NoteRow below.
  onExportToPortal: (note: TreeNote) => void;
  // The folder just created via "New folder"/"New subfolder" — that one row
  // mounts already in rename mode instead of requiring an extra click,
  // matching Confluence's "Untitled folder" auto-rename behavior.
  autoRenameFolderId?: string | null;
  emptyLabel: string;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const childFoldersOf = useMemo(() => {
    const map = new Map<string | null, TreeFolder[]>();
    for (const f of folders) {
      const key = f.parentId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(f);
    }
    return map;
  }, [folders]);

  const notesOf = useMemo(() => {
    const map = new Map<string | null, TreeNote[]>();
    for (const n of notes) {
      const key = n.folderId;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(n);
    }
    for (const list of map.values()) {
      list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    }
    return map;
  }, [notes]);

  if (folders.length === 0 && notes.length === 0) {
    return <p className="p-4 text-sm text-neutral-400 italic">{emptyLabel}</p>;
  }

  return (
    <div className="py-1">
      <FolderLevel
        parentId={null}
        depth={0}
        childFoldersOf={childFoldersOf}
        notesOf={notesOf}
        collapsed={collapsed}
        onToggle={toggle}
        selectedNoteId={selectedNoteId}
        onSelectNote={onSelectNote}
        canManage={canManage}
        onRenameFolder={onRenameFolder}
        onDeleteFolder={onDeleteFolder}
        onMoveFolder={onMoveFolder}
        onMoveNote={onMoveNote}
        onDeleteNote={onDeleteNote}
        onSetFolderIcon={onSetFolderIcon}
        onSetNoteIcon={onSetNoteIcon}
        onCreateNoteInFolder={onCreateNoteInFolder}
        onCreateSubfolder={onCreateSubfolder}
        onExportToPortal={onExportToPortal}
        autoRenameFolderId={autoRenameFolderId ?? null}
      />
    </div>
  );
}

interface LevelProps {
  parentId: string | null;
  depth: number;
  childFoldersOf: Map<string | null, TreeFolder[]>;
  notesOf: Map<string | null, TreeNote[]>;
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  selectedNoteId: string | null;
  onSelectNote: (id: string) => void;
  canManage: boolean;
  onRenameFolder: (folder: TreeFolder, name: string) => void;
  onDeleteFolder: (folder: TreeFolder) => void;
  onMoveFolder: (folder: TreeFolder) => void;
  onMoveNote: (note: TreeNote) => void;
  onDeleteNote: (note: TreeNote) => void;
  onSetFolderIcon: (folder: TreeFolder, icon: string | null) => void;
  onSetNoteIcon: (note: TreeNote, icon: string | null) => void;
  onCreateNoteInFolder: (folderId: string) => void;
  onCreateSubfolder: (folderId: string) => void;
  onExportToPortal: (note: TreeNote) => void;
  autoRenameFolderId: string | null;
}

function FolderLevel(props: LevelProps) {
  const { parentId, depth, childFoldersOf, notesOf, collapsed, onToggle } = props;
  const childFolders = childFoldersOf.get(parentId) ?? [];
  const childNotes = notesOf.get(parentId) ?? [];

  return (
    <>
      {childFolders.map((folder) => (
        <FolderRow
          key={folder.id}
          folder={folder}
          depth={depth}
          isCollapsed={collapsed.has(folder.id)}
          onToggle={() => onToggle(folder.id)}
          canManage={props.canManage}
          onRename={(name) => props.onRenameFolder(folder, name)}
          onDelete={() => props.onDeleteFolder(folder)}
          onMove={() => props.onMoveFolder(folder)}
          onSetIcon={(icon) => props.onSetFolderIcon(folder, icon)}
          onCreateNote={() => props.onCreateNoteInFolder(folder.id)}
          onCreateSubfolder={() => props.onCreateSubfolder(folder.id)}
          autoRename={folder.id === props.autoRenameFolderId}
        >
          {!collapsed.has(folder.id) && <FolderLevel {...props} parentId={folder.id} depth={depth + 1} />}
        </FolderRow>
      ))}
      {childNotes.map((note) => (
        <NoteRow
          key={note.id}
          note={note}
          depth={depth}
          selected={note.id === props.selectedNoteId}
          onSelect={() => props.onSelectNote(note.id)}
          canManage={props.canManage}
          onMove={() => props.onMoveNote(note)}
          onDelete={() => props.onDeleteNote(note)}
          onSetIcon={(icon) => props.onSetNoteIcon(note, icon)}
          onExportToPortal={() => props.onExportToPortal(note)}
        />
      ))}
    </>
  );
}

function FolderRow({
  folder,
  depth,
  isCollapsed,
  onToggle,
  canManage,
  onRename,
  onDelete,
  onMove,
  onSetIcon,
  onCreateNote,
  onCreateSubfolder,
  autoRename,
  children,
}: {
  folder: TreeFolder;
  depth: number;
  isCollapsed: boolean;
  onToggle: () => void;
  canManage: boolean;
  onRename: (name: string) => void;
  onDelete: () => void;
  onMove: () => void;
  onSetIcon: (icon: string | null) => void;
  onCreateNote: () => void;
  onCreateSubfolder: () => void;
  autoRename: boolean;
  children: React.ReactNode;
}) {
  const [renaming, setRenaming] = useState(autoRename);
  const [draft, setDraft] = useState(folder.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);

  function commitRename() {
    setRenaming(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== folder.name) onRename(trimmed);
    else setDraft(folder.name);
  }

  return (
    <div>
      <div className="group flex items-center gap-1 py-1 pr-1.5 hover:bg-neutral-50" style={{ paddingLeft: 8 + depth * 14 }}>
        <button
          type="button"
          onClick={onToggle}
          aria-label={isCollapsed ? "Expand folder" : "Collapse folder"}
          className="flex h-4 w-4 shrink-0 items-center justify-center text-neutral-400"
        >
          <ChevronIcon collapsed={isCollapsed} />
        </button>
        <IconPickerButton
          icon={folder.icon}
          fallback={<FolderIcon />}
          onSelect={onSetIcon}
          onClear={() => onSetIcon(null)}
          size="sm"
        />
        {renaming ? (
          <input
            autoFocus
            value={draft}
            onFocus={(e) => e.target.select()}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") {
                // Stopped so it doesn't also bubble to CloseButton.tsx's
                // window-level Escape listener and navigate out of Notes.
                e.stopPropagation();
                setDraft(folder.name);
                setRenaming(false);
              }
            }}
            className="min-w-0 flex-1 rounded border border-neutral-300 px-1 py-0.5 text-sm focus:outline-none"
          />
        ) : (
          <button type="button" onClick={onToggle} className="min-w-0 flex-1 truncate text-left text-sm text-neutral-700">
            {folder.name}
          </button>
        )}
        {canManage && !renaming && (
          <div className="flex shrink-0 items-center gap-0.5 opacity-0 group-hover:opacity-100">
            <RowMenu
              open={createMenuOpen}
              onOpenChange={setCreateMenuOpen}
              trigger={<PlusIcon />}
              ariaLabel="New note or subfolder"
              items={[
                { label: "New note", icon: <NoteIcon />, onClick: onCreateNote },
                { label: "New subfolder", icon: <FolderIcon />, onClick: onCreateSubfolder },
              ]}
            />
            <RowMenu
              open={menuOpen}
              onOpenChange={setMenuOpen}
              items={[
                { label: "Rename", onClick: () => setRenaming(true) },
                { label: "Move to…", onClick: onMove },
                { label: "Delete", onClick: onDelete, danger: true },
              ]}
            />
          </div>
        )}
      </div>
      {!isCollapsed && children}
    </div>
  );
}

function NoteRow({
  note,
  depth,
  selected,
  onSelect,
  canManage,
  onMove,
  onSetIcon,
  onDelete,
  onExportToPortal,
}: {
  note: TreeNote;
  depth: number;
  selected: boolean;
  onSelect: () => void;
  canManage: boolean;
  onMove: () => void;
  onSetIcon: (icon: string | null) => void;
  onDelete: () => void;
  onExportToPortal: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className="group flex items-center gap-1 py-1 pr-1.5 hover:bg-neutral-50"
      style={{ paddingLeft: 8 + depth * 14 + 18, background: selected ? "var(--brand-purple-tint)" : undefined }}
    >
      <IconPickerButton icon={note.icon} fallback={<NoteIcon />} onSelect={onSetIcon} onClear={() => onSetIcon(null)} size="sm" />
      {/* The title span isn't flex-1 — it hugs its own content (shrinking
          only once the row actually runs out of room, via min-w-0) so the
          tag sits right next to a short title instead of a flex-1 title
          stretching to fill the row and shoving the tag out to the far
          right edge, leaving a wide dead gap in between for anything but a
          long title. */}
      <button type="button" onClick={onSelect} className="flex min-w-0 flex-1 items-baseline gap-1.5 text-left">
        <span className="min-w-0 truncate text-sm text-neutral-800">{note.title}</span>
        {note.subtitle && (
          <span className="shrink-0">
            <Tag label={note.subtitle} {...colorForScope(note.subtitle)} />
          </span>
        )}
      </button>
      {/* "Upload to portal" always shows, regardless of canManage — any note
          member can export it (see NotesPageContent.tsx), same access rule
          as viewing the note itself. Move/Delete stay canManage-gated. */}
      <RowMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        items={[
          ...(canManage ? [{ label: "Move to…", onClick: onMove }] : []),
          { label: "Upload to portal", icon: <Icon name="File/Cloud_Upload" size={13} />, onClick: onExportToPortal },
          ...(canManage ? [{ label: "Delete", onClick: onDelete, danger: true }] : []),
        ]}
      />
    </div>
  );
}

function RowMenu({
  open,
  onOpenChange,
  items,
  trigger,
  ariaLabel = "More options",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: { label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean }[];
  // Defaults to the vertical-dots "more options" glyph — pass a different
  // trigger (e.g. PlusIcon) to reuse this same popover shell for a
  // differently-purposed menu, like the folder row's "New note/New
  // subfolder" picker.
  trigger?: React.ReactNode;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div ref={ref} className="relative shrink-0 opacity-0 group-hover:opacity-100" style={open ? { opacity: 1 } : undefined}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onOpenChange(!open);
        }}
        aria-label={ariaLabel}
        title={ariaLabel}
        className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100"
      >
        {trigger ?? <MoreVerticalIcon />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => onOpenChange(false)} />
          <div className="absolute top-full right-0 z-20 mt-1 w-40 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenChange(false);
                  item.onClick();
                }}
                className={`flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-neutral-50 ${
                  item.danger ? "text-red-600" : "text-neutral-700"
                }`}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export function MoreVerticalIcon() {
  return <Icon name="Menu/More_Vertical" size={13} />;
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <span style={{ display: "inline-flex", transform: collapsed ? "rotate(0deg)" : "rotate(90deg)", transition: "transform 0.1s" }}>
      <Icon name="Arrow/Chevron_Right" size={11} />
    </span>
  );
}

function PlusIcon() {
  return <Icon name="Edit/Add_Plus" size={12} />;
}

export function FolderIcon() {
  return <Icon name="File/Folder" size={14} className="shrink-0 text-neutral-400" />;
}

export function NoteIcon() {
  return <Icon name="File/Note" size={14} className="shrink-0 text-neutral-400" />;
}

// Rendered above a note's title in both editors when it lives inside a
// folder (root-only notes render nothing — no point in a zero-segment
// breadcrumb) — root-first, e.g. "Engineering / Sprint notes".
export function NoteBreadcrumb({ path }: { path: string[] }) {
  if (path.length === 0) return null;
  return (
    <div className="mb-2 flex min-w-0 flex-wrap items-center gap-1 text-xs text-neutral-400">
      {path.map((name, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1">
          {i > 0 && <Icon name="Arrow/Chevron_Right" size={9} className="shrink-0 text-neutral-300" />}
          <span className="truncate">{name}</span>
        </span>
      ))}
    </div>
  );
}

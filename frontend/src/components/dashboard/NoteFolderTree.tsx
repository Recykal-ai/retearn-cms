"use client";

import { useMemo, useRef, useState } from "react";
import { relativeTime } from "@/lib/relative-time";

export interface TreeFolder {
  id: string;
  name: string;
  parentId: string | null;
}

// Depth-first flattening of a folder list into <select>-friendly options,
// each label indented to show nesting — used by the create/move modals so
// picking a target folder looks like a tree even inside a plain <select>.
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

export interface TreeNote {
  id: string;
  title: string;
  folderId: string | null;
  updatedAt: string;
  subtitle: string; // e.g. team name — appended after the relative time
}

// Obsidian-style nested folder tree: folders before notes at each level,
// folders alphabetical (already sorted that way by the backend), notes
// newest-first. Purely a renderer — all mutation goes through the callback
// props, called from NotesPageContent.tsx's server actions.
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
      />
    </div>
  );
}

function FolderLevel({
  parentId,
  depth,
  childFoldersOf,
  notesOf,
  collapsed,
  onToggle,
  selectedNoteId,
  onSelectNote,
  canManage,
  onRenameFolder,
  onDeleteFolder,
  onMoveFolder,
  onMoveNote,
}: {
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
}) {
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
          canManage={canManage}
          onRename={(name) => onRenameFolder(folder, name)}
          onDelete={() => onDeleteFolder(folder)}
          onMove={() => onMoveFolder(folder)}
        >
          {!collapsed.has(folder.id) && (
            <FolderLevel
              parentId={folder.id}
              depth={depth + 1}
              childFoldersOf={childFoldersOf}
              notesOf={notesOf}
              collapsed={collapsed}
              onToggle={onToggle}
              selectedNoteId={selectedNoteId}
              onSelectNote={onSelectNote}
              canManage={canManage}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              onMoveFolder={onMoveFolder}
              onMoveNote={onMoveNote}
            />
          )}
        </FolderRow>
      ))}
      {childNotes.map((note) => (
        <NoteRow
          key={note.id}
          note={note}
          depth={depth}
          selected={note.id === selectedNoteId}
          onSelect={() => onSelectNote(note.id)}
          canManage={canManage}
          onMove={() => onMoveNote(note)}
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
  children: React.ReactNode;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(folder.name);
  const [menuOpen, setMenuOpen] = useState(false);

  function commitRename() {
    setRenaming(false);
    const trimmed = draft.trim();
    if (trimmed && trimmed !== folder.name) onRename(trimmed);
    else setDraft(folder.name);
  }

  return (
    <div>
      <div
        className="group flex items-center gap-1 py-1.5 pr-2 hover:bg-neutral-50"
        style={{ paddingLeft: 12 + depth * 16 }}
      >
        <button
          type="button"
          onClick={onToggle}
          aria-label={isCollapsed ? "Expand folder" : "Collapse folder"}
          className="flex h-4 w-4 shrink-0 items-center justify-center text-neutral-400"
        >
          <ChevronIcon collapsed={isCollapsed} />
        </button>
        <FolderIcon />
        {renaming ? (
          <input
            autoFocus
            value={draft}
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
          <button type="button" onClick={onToggle} className="min-w-0 flex-1 truncate text-left text-sm font-medium text-neutral-700">
            {folder.name}
          </button>
        )}
        {canManage && !renaming && (
          <RowMenu
            open={menuOpen}
            onOpenChange={setMenuOpen}
            items={[
              { label: "Rename", onClick: () => setRenaming(true) },
              { label: "Move to…", onClick: onMove },
              { label: "Delete", onClick: onDelete, danger: true },
            ]}
          />
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
}: {
  note: TreeNote;
  depth: number;
  selected: boolean;
  onSelect: () => void;
  canManage: boolean;
  onMove: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div
      className="group flex items-center gap-1 pr-2"
      style={{ paddingLeft: 12 + depth * 16 + 20, background: selected ? "var(--brand-purple-tint)" : undefined }}
    >
      <button type="button" onClick={onSelect} className="min-w-0 flex-1 truncate py-2 text-left">
        <span className="block truncate text-sm font-medium text-neutral-800">{note.title}</span>
        <span className="block text-xs text-neutral-400" suppressHydrationWarning>
          {relativeTime(note.updatedAt)}
          {note.subtitle ? ` · ${note.subtitle}` : ""}
        </span>
      </button>
      {canManage && (
        <RowMenu open={menuOpen} onOpenChange={setMenuOpen} items={[{ label: "Move to…", onClick: onMove }]} />
      )}
    </div>
  );
}

function RowMenu({
  open,
  onOpenChange,
  items,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: { label: string; onClick: () => void; danger?: boolean }[];
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
        aria-label="More options"
        className="flex h-5 w-5 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100"
      >
        ⋯
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => onOpenChange(false)} />
          <div className="absolute top-full right-0 z-20 mt-1 w-36 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenChange(false);
                  item.onClick();
                }}
                className={`block w-full px-2.5 py-1.5 text-left text-xs hover:bg-neutral-50 ${
                  item.danger ? "text-red-600" : "text-neutral-700"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      style={{ transform: collapsed ? "rotate(0deg)" : "rotate(90deg)", transition: "transform 0.1s" }}
    >
      <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden className="shrink-0 text-neutral-400">
      <path
        d="M4 6.5A1.5 1.5 0 0 1 5.5 5h4.4l1.8 2h7.3A1.5 1.5 0 0 1 20.5 8.5v9A1.5 1.5 0 0 1 19 19H5.5A1.5 1.5 0 0 1 4 17.5v-11Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

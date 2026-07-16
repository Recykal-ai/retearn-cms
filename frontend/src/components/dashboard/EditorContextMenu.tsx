"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { Editor } from "@tiptap/react";

// Obsidian-style right-click menu: Format (inline marks) and Paragraph
// (block type) as hover-out flyout submenus, replacing the old always-on
// toolbar so the editor itself stays visually clean. Only the items that
// map to a real, currently-installed Tiptap capability are here — Obsidian's
// own menu also has link/search/extract-selection items that are specific
// to its wiki-linking and note-splitting features, which this app's note
// model has no equivalent of.
export function EditorContextMenu({
  editor,
  x,
  y,
  onClose,
  onInsertImage,
}: {
  editor: Editor;
  x: number;
  y: number;
  onClose: () => void;
  onInsertImage: () => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });

  // Clamps into the viewport after the real size is known — the menu can't
  // be measured before its first paint, so position starts at the raw click
  // point and snaps inward on the same frame the browser would otherwise
  // paint an overflowing menu.
  useLayoutEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const clampedX = Math.min(x, window.innerWidth - rect.width - 8);
    const clampedY = Math.min(y, window.innerHeight - rect.height - 8);
    setPos({ x: Math.max(8, clampedX), y: Math.max(8, clampedY) });
  }, [x, y]);

  useEffect(() => {
    function onMouseDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    // mousedown (not click) so this doesn't also swallow the click that
    // opens it — the contextmenu event that triggers onContextMenu fires
    // before this listener is even attached, so there's no double-handling.
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  function run(fn: () => void) {
    fn();
    onClose();
  }

  return (
    <div
      ref={rootRef}
      className="fixed z-50 w-44 rounded-md border border-neutral-200 bg-white py-1 text-sm shadow-lg"
      style={{ left: pos.x, top: pos.y, fontFamily: "var(--font-ui)" }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuRow label="Format">
        <MenuItem active={editor.isActive("bold")} onClick={() => run(() => editor.chain().focus().toggleBold().run())}>
          Bold
        </MenuItem>
        <MenuItem active={editor.isActive("italic")} onClick={() => run(() => editor.chain().focus().toggleItalic().run())}>
          Italic
        </MenuItem>
        <MenuItem active={editor.isActive("strike")} onClick={() => run(() => editor.chain().focus().toggleStrike().run())}>
          Strikethrough
        </MenuItem>
        <MenuItem active={editor.isActive("highlight")} onClick={() => run(() => editor.chain().focus().toggleHighlight().run())}>
          Highlight
        </MenuItem>
        <MenuItem active={editor.isActive("code")} onClick={() => run(() => editor.chain().focus().toggleCode().run())}>
          Code
        </MenuItem>
      </MenuRow>

      <MenuRow label="Paragraph">
        <MenuItem active={editor.isActive("bulletList")} onClick={() => run(() => editor.chain().focus().toggleBulletList().run())}>
          Bullet list
        </MenuItem>
        <MenuItem active={editor.isActive("orderedList")} onClick={() => run(() => editor.chain().focus().toggleOrderedList().run())}>
          Numbered list
        </MenuItem>
        <MenuItem active={editor.isActive("taskList")} onClick={() => run(() => editor.chain().focus().toggleTaskList().run())}>
          Task list
        </MenuItem>
        <div className="my-1 border-t border-neutral-100" />
        {[1, 2, 3, 4, 5, 6].map((level) => (
          <MenuItem
            key={level}
            active={editor.isActive("heading", { level })}
            onClick={() => run(() => editor.chain().focus().toggleHeading({ level: level as 1 | 2 | 3 | 4 | 5 | 6 }).run())}
          >
            Heading {level}
          </MenuItem>
        ))}
        <MenuItem active={editor.isActive("paragraph")} onClick={() => run(() => editor.chain().focus().setParagraph().run())}>
          Body
        </MenuItem>
        <MenuItem active={editor.isActive("blockquote")} onClick={() => run(() => editor.chain().focus().toggleBlockquote().run())}>
          Quote
        </MenuItem>
      </MenuRow>

      <div className="my-1 border-t border-neutral-100" />
      <MenuItem active={false} onClick={() => run(onInsertImage)}>
        Insert image…
      </MenuItem>
    </div>
  );
}

// A top-level row that flies out a submenu to its right on hover — same
// interaction as a native OS context menu, so it reads as familiar rather
// than needing an extra click to "expand" before picking anything.
function MenuRow({ label, children }: { label: string; children: React.ReactNode }) {
  const [hover, setHover] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const [side, setSide] = useState<"right" | "left">("right");

  useLayoutEffect(() => {
    if (!hover || !rowRef.current) return;
    const rect = rowRef.current.getBoundingClientRect();
    // Flip to the left if the submenu (assume ~180px) would run off-screen.
    setSide(rect.right + 180 > window.innerWidth ? "left" : "right");
  }, [hover]);

  return (
    <div ref={rowRef} className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="flex items-center justify-between px-3 py-1.5 hover:bg-neutral-50">
        <span className="text-neutral-700">{label}</span>
        <span className="text-neutral-400">▸</span>
      </div>
      {hover && (
        <div
          className="absolute top-0 w-44 rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
          style={side === "right" ? { left: "100%" } : { right: "100%" }}
        >
          {children}
        </div>
      )}
    </div>
  );
}

function MenuItem({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between px-3 py-1.5 text-left hover:bg-neutral-50"
      style={active ? { color: "var(--brand-purple)", fontWeight: 600 } : { color: "#404040" }}
    >
      {children}
      {active && <span aria-hidden>✓</span>}
    </button>
  );
}

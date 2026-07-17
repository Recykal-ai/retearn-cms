"use client";

import { useState } from "react";
import type { Editor } from "@tiptap/react";

const HEADING_LEVELS = [1, 2, 3, 4, 5, 6] as const;

function currentBlockLabel(editor: Editor): string {
  for (const level of HEADING_LEVELS) {
    if (editor.isActive("heading", { level })) return `Heading ${level}`;
  }
  if (editor.isActive("bulletList")) return "Bulleted list";
  if (editor.isActive("orderedList")) return "Numbered list";
  if (editor.isActive("taskList")) return "Task list";
  if (editor.isActive("blockquote")) return "Quote";
  return "Normal text";
}

// Notion's selection toolbar content — rendered inside a Tiptap BubbleMenu
// (see RichTextEditor.tsx), which auto-shows the instant text is selected
// and auto-hides when it isn't, with its own Floating UI positioning. This
// component only owns the content, not showing/hiding/positioning itself.
// The "/" slash command (see SlashCommandExtension.tsx) stays the way to
// insert new blocks/images — this one is specifically for (re)formatting
// text you've already selected. Notion's own version also has color,
// reactions, and an equation editor — dropped here since none of those
// exist in this app; Comment is kept, but — unlike Bold/Link/etc — it
// doesn't act inline. Clicking it just reports the selection up to
// TeamNoteEditor (onRequestComment), which opens the actual compose UI as a
// draft card in the floating margin, matching where Notion's own comment
// composer lives (onRequestComment is only passed for team notes — personal
// notes have no thread to add to, so the button is simply omitted there).
export function SelectionToolbar({
  editor,
  onRequestComment,
}: {
  editor: Editor;
  onRequestComment?: (range: { from: number; to: number }, quotedText: string) => void;
}) {
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [linkInputOpen, setLinkInputOpen] = useState(false);
  const [linkValue, setLinkValue] = useState("");

  function setBlockType(fn: () => void) {
    fn();
    setBlockMenuOpen(false);
  }

  function toggle(fn: () => void) {
    fn();
    // Deliberately stays open — toggling Bold then Highlight on the same
    // selection without the popup closing between clicks matches Notion's
    // own toolbar (and the selection itself is what's being acted on, not
    // a one-shot insert like the slash menu's items).
  }

  function confirmLink() {
    const url = linkValue.trim();
    if (url) {
      editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    } else {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
    }
    setLinkInputOpen(false);
    setLinkValue("");
  }

  function requestComment() {
    if (!onRequestComment) return;
    const { from, to } = editor.state.selection;
    const quotedText = editor.state.doc.textBetween(from, to, " ");
    // Collapsing right away (range/quotedText are already captured) closes
    // this toolbar immediately — Notion does the same the moment you click
    // Comment, so it isn't left floating over the draft card that's about
    // to appear in the comments panel.
    editor.chain().setTextSelection(to).run();
    onRequestComment({ from, to }, quotedText);
  }

  return (
    <div
      className="w-64 rounded-lg border border-neutral-200 bg-white py-1.5 shadow-lg"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      {linkInputOpen ? (
        <div className="flex items-center gap-1.5 px-2 py-1">
          <input
            autoFocus
            value={linkValue}
            onChange={(e) => setLinkValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmLink();
              if (e.key === "Escape") setLinkInputOpen(false);
            }}
            placeholder="Paste a link…"
            className="w-full rounded-md border border-neutral-200 px-2 py-1 text-xs focus:border-neutral-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={confirmLink}
            className="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-white"
            style={{ background: "var(--brand-purple)" }}
          >
            Add
          </button>
        </div>
      ) : (
        <>
          <div className="relative">
            <button
              type="button"
              onClick={() => setBlockMenuOpen((v) => !v)}
              className="flex w-full items-center justify-between px-3 py-1.5 text-sm hover:bg-neutral-50"
            >
              <span className="flex items-center gap-2 text-neutral-700">
                <TextGlyph>T</TextGlyph>
                {currentBlockLabel(editor)}
              </span>
              <span className="text-neutral-400">{blockMenuOpen ? "▾" : "▸"}</span>
            </button>
            {blockMenuOpen && (
              <div className="border-t border-neutral-100 py-1">
                <BlockItem onClick={() => setBlockType(() => editor.chain().focus().setParagraph().run())}>
                  Text
                </BlockItem>
                {HEADING_LEVELS.map((level) => (
                  <BlockItem
                    key={level}
                    onClick={() => setBlockType(() => editor.chain().focus().toggleHeading({ level }).run())}
                  >
                    Heading {level}
                  </BlockItem>
                ))}
                <BlockItem onClick={() => setBlockType(() => editor.chain().focus().toggleBulletList().run())}>
                  Bulleted list
                </BlockItem>
                <BlockItem onClick={() => setBlockType(() => editor.chain().focus().toggleOrderedList().run())}>
                  Numbered list
                </BlockItem>
                <BlockItem onClick={() => setBlockType(() => editor.chain().focus().toggleTaskList().run())}>
                  Task list
                </BlockItem>
                <BlockItem onClick={() => setBlockType(() => editor.chain().focus().toggleBlockquote().run())}>
                  Quote
                </BlockItem>
              </div>
            )}
          </div>

          {!blockMenuOpen && (
            <>
              <div className="my-1 border-t border-neutral-100" />
              <div className="flex flex-nowrap items-center justify-between px-2 py-1">
                <IconButton active={editor.isActive("bold")} label="Bold" onClick={() => toggle(() => editor.chain().focus().toggleBold().run())}>
                  <TextGlyph style={{ fontWeight: 800 }}>B</TextGlyph>
                </IconButton>
                <IconButton active={editor.isActive("italic")} label="Italic" onClick={() => toggle(() => editor.chain().focus().toggleItalic().run())}>
                  <TextGlyph style={{ fontStyle: "italic" }}>I</TextGlyph>
                </IconButton>
                <IconButton active={editor.isActive("underline")} label="Underline" onClick={() => toggle(() => editor.chain().focus().toggleUnderline().run())}>
                  <TextGlyph style={{ textDecoration: "underline" }}>U</TextGlyph>
                </IconButton>
                <IconButton active={editor.isActive("strike")} label="Strikethrough" onClick={() => toggle(() => editor.chain().focus().toggleStrike().run())}>
                  <TextGlyph style={{ textDecoration: "line-through" }}>S</TextGlyph>
                </IconButton>
                <IconButton
                  active={editor.isActive("highlight")}
                  label="Highlight"
                  onClick={() => toggle(() => editor.chain().focus().toggleHighlight().run())}
                >
                  <TextGlyph style={{ background: "#fef08a" }}>H</TextGlyph>
                </IconButton>
                <IconButton active={editor.isActive("code")} label="Code" onClick={() => toggle(() => editor.chain().focus().toggleCode().run())}>
                  <TextGlyph style={{ fontFamily: "ui-monospace, monospace", fontSize: "11px" }}>{"</>"}</TextGlyph>
                </IconButton>
                <IconButton
                  active={editor.isActive("link")}
                  label="Link"
                  onClick={() => {
                    setLinkValue((editor.getAttributes("link").href as string | undefined) ?? "");
                    setLinkInputOpen(true);
                  }}
                >
                  <LinkIcon />
                </IconButton>
                {onRequestComment && (
                  <IconButton active={false} label="Comment" onClick={requestComment}>
                    <CommentIcon />
                  </IconButton>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function TextGlyph({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span className="text-sm text-neutral-700" style={style}>
      {children}
    </span>
  );
}

function BlockItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="block w-full px-3 py-1.5 text-left text-sm text-neutral-700 hover:bg-neutral-50">
      {children}
    </button>
  );
}

function IconButton({
  active,
  label,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-neutral-100"
      style={active ? { background: "var(--brand-purple-tint)", color: "var(--brand-purple)" } : undefined}
    >
      {children}
    </button>
  );
}

function LinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9.5 14.5l5-5M8 7.5l1.2-1.2a3.5 3.5 0 0 1 5 5L13 12.5M16 16.5l-1.2 1.2a3.5 3.5 0 0 1-5-5L11 11.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 5.5a1.5 1.5 0 0 1 1.5-1.5h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5v-3.5H5.5A1.5 1.5 0 0 1 4 14.5v-9Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

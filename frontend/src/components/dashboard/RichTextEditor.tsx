"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { useEditor, EditorContent, ReactRenderer, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { NodeSelection } from "@tiptap/pm/state";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { DocumentEmbed } from "@/components/dashboard/DocumentEmbedExtension";
import { NoteImage } from "@/components/dashboard/NoteImageExtension";
import { CommentMark, commentHighlightPluginKey } from "@/components/dashboard/CommentMarkExtension";
import { SlashCommand } from "@/components/dashboard/SlashCommandExtension";
import { SelectionToolbar } from "@/components/dashboard/SelectionToolbar";
import { uploadNoteImageAction } from "@/app/dashboard/notes-actions";
import { useToast } from "@/components/ToastProvider";

export interface CommentThreadRef {
  threadId: string;
  resolved: boolean;
}

export type NoteAnchorKind = "image" | "document" | "comment";

export interface RichTextEditorHandle {
  scrollToAnchor: (kind: NoteAnchorKind, anchorId: string) => void;
  removeCommentMark: (threadId: string) => void;
  // Applies the comment mark to an already-known range (captured by
  // SelectionToolbar.tsx at the moment "Comment" was clicked) — used once a
  // draft comment card in the floating margin actually gets submitted; see
  // TeamNoteEditor.tsx's submitDraft.
  applyCommentMark: (threadId: string, range: { from: number; to: number }) => void;
  // Viewport-relative rect of an anchor's first occurrence, or null if it
  // isn't currently in the DOM — FloatingComments.tsx converts this to a
  // position within its own scroll container to place each card adjacent to
  // its corresponding highlighted line, Google-Docs-margin-note style.
  getAnchorRect: (kind: NoteAnchorKind, anchorId: string) => DOMRect | null;
  // Same idea for a draft comment, which has no mark/anchor in the doc yet
  // (it hasn't been submitted) — positions it from the raw ProseMirror
  // position captured when "Comment" was clicked instead.
  getViewportTopAtPos: (pos: number) => number | null;
}

function anchorSelector(kind: NoteAnchorKind, anchorId: string): string {
  const escaped = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(anchorId) : anchorId;
  if (kind === "image") return `[data-image-key="${escaped}"]`;
  if (kind === "document") return `[data-id="${escaped}"]`;
  return `[data-comment-id="${escaped}"]`;
}

export interface MentionCandidate {
  id: string;
  label: string;
}

// The mention suggestion dropdown — rendered via ReactRenderer and
// positioned by @tiptap/suggestion's own props.mount() (Floating UI under
// the hood, auto-repositions on scroll/resize — no manual positioning code
// needed here).
const MentionList = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  { items: MentionCandidate[]; command: (item: MentionCandidate) => void }
>(function MentionList({ items, command }, ref) {
  // Tracked by id rather than index — when a new (re-filtered) items array
  // arrives, an id that's no longer present just naturally falls back to
  // index 0 below, with no reset effect/ref needed at all.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const rawIndex = items.findIndex((i) => i.id === selectedId);
  const selectedIndex = rawIndex === -1 ? 0 : rawIndex;

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }) {
      if (event.key === "ArrowDown") {
        const next = items[(selectedIndex + 1) % items.length];
        if (next) setSelectedId(next.id);
        return true;
      }
      if (event.key === "ArrowUp") {
        const next = items[(selectedIndex - 1 + items.length) % items.length];
        if (next) setSelectedId(next.id);
        return true;
      }
      if (event.key === "Enter") {
        if (items[selectedIndex]) command(items[selectedIndex]);
        return true;
      }
      return false;
    },
  }));

  if (items.length === 0) {
    return <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-400 shadow-lg">No matches</div>;
  }

  return (
    <div className="max-h-48 overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
      {items.map((item, i) => (
        <button
          key={item.id}
          type="button"
          onClick={() => command(item)}
          className="block w-full px-3 py-1.5 text-left text-sm"
          style={i === selectedIndex ? { background: "var(--brand-purple-tint)" } : undefined}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
});

function buildMentionSuggestion(candidates: MentionCandidate[]): Partial<SuggestionOptions<MentionCandidate>> {
  return {
    items: ({ query }) =>
      candidates.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())).slice(0, 8),
    render: () => {
      let component: ReactRenderer<{ onKeyDown: (props: { event: KeyboardEvent }) => boolean }> | undefined;
      let unmount: (() => void) | undefined;

      return {
        onStart: (props) => {
          component = new ReactRenderer(MentionList, {
            props: { items: props.items, command: props.command },
            editor: props.editor,
          });
          unmount = props.mount(component.element as HTMLElement);
        },
        onUpdate: (props) => {
          component?.updateProps({ items: props.items, command: props.command });
        },
        onKeyDown: (props) => component?.ref?.onKeyDown(props) ?? false,
        onExit: () => {
          unmount?.();
          component?.destroy();
        },
      };
    },
  };
}

function imageFilesFrom(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
}

// Notion detects a code paste well beyond just "counts some brackets" (it
// reads clipboard metadata a real code editor attaches), but a copy from
// VS Code specifically DOES carry an extra clipboard type — checking for
// that first is a near-zero-false-positive signal. Everything else (a
// paste from a browser/terminal/plain text file with no such metadata)
// falls back to a plain heuristic: enough code-shaped punctuation/keywords,
// packed densely enough, that it reads as code rather than prose — the
// same rough idea. Kept intentionally conservative (requires several
// matches AND either real density or multiple indented lines) since a
// false positive silently turns someone's paragraph into a code block.
const CODE_SIGNAL_REGEX =
  /[{}\[\];]|=>|\bfunction\b|\bconst\b|\blet\b|\bvar\b|\bimport\b|\bexport\b|\bclass\b|\bdef\b|\breturn\b|#include|:\s*["'{]/gi;

function looksLikeCode(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const matches = trimmed.match(CODE_SIGNAL_REGEX) ?? [];
  if (matches.length < 4) return false;
  const density = matches.length / trimmed.length;
  const indentedLines = trimmed.split("\n").filter((l) => /^(\s{2,}|\t)/.test(l)).length;
  return density > 0.02 || indentedLines >= 2 || trimmed.split("\n").length >= 4;
}

export const RichTextEditor = forwardRef<
  RichTextEditorHandle,
  {
    content: string;
    onChange: (html: string) => void;
    mentionCandidates?: MentionCandidate[];
    placeholder?: string;
    // Team-note-only (see CommentMarkExtension.tsx) — omitted entirely for
    // personal notes, which get no Comment button and no resolved/hover styling.
    comments?: CommentThreadRef[];
    // Fired when "Comment" is clicked in the selection toolbar — reports the
    // range/quoted text/position up to TeamNoteEditor, which opens a draft
    // card in the floating margin rather than an inline compose box (see
    // SelectionToolbar.tsx — it used to own this itself; Notion opens the
    // composer in the margin, not next to the selection).
    onRequestComment?: (range: { from: number; to: number }, quotedText: string) => void;
    onCommentMarkClick?: (threadId: string) => void;
    onCommentMarkHover?: (threadId: string | null) => void;
    hoveredThreadId?: string | null;
  }
>(function RichTextEditor(
  { content, onChange, mentionCandidates, placeholder, comments, onRequestComment, onCommentMarkClick, onCommentMarkHover, hoveredThreadId },
  ref,
) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { show } = useToast();

  // Shared by the slash-menu's "Insert image" (file picker), pasting an
  // image from the clipboard, and dragging one in — all three just need to
  // get bytes to the server and drop a noteImage node in wherever's
  // appropriate; only how that position is chosen differs per caller.
  function uploadAndInsertImage(editor: Editor, file: File, atPos?: number) {
    const formData = new FormData();
    formData.append("file", file);
    uploadNoteImageAction(formData).then((result) => {
      if (result.error || !result.key) {
        show(result.error ?? "Failed to upload image", "error");
        return;
      }
      const node = { type: "noteImage", attrs: { imageKey: result.key } };
      if (atPos !== undefined) {
        editor.chain().focus().insertContentAt(atPos, node).run();
      } else {
        editor.chain().focus().insertContent(node).run();
      }
    });
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // Tiptap v3's StarterKit bundles the Link extension — autolink turns a
      // pasted or typed URL into a real <a> automatically, and the same
      // extension's setLink/unsetLink commands back the selection toolbar's
      // manual "Link" button below. openOnClick: false so clicking a link
      // while editing doesn't navigate the whole tab away mid-edit (still
      // openable via the usual ctrl/cmd+click). underline isn't configured
      // here at all — StarterKit registers it by default.
      StarterKit.configure({
        link: { autolink: true, openOnClick: false, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } },
      }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      DocumentEmbed,
      NoteImage,
      CommentMark,
      Placeholder.configure({
        placeholder: ({ editor: e }) => (e.isEmpty ? `${placeholder ?? "Write something…"} Press '/' for commands` : ""),
      }),
      // Notion-style "/" command palette — replaces the old right-click menu
      // entirely. Same @tiptap/suggestion utility @mention already uses
      // below, just triggered by "/" and rendering block/format commands.
      SlashCommand.configure({ onInsertImage: () => fileInputRef.current?.click() }),
      ...(mentionCandidates
        ? [
            Mention.configure({
              HTMLAttributes: { "data-type": "mention" },
              suggestion: {
                char: "@",
                // Default only allows a space right before "@" — meaning
                // "word@" (no space) silently never triggers, which reads as
                // "mentions don't work" from a real user just typing
                // naturally. null lifts that restriction entirely.
                allowedPrefixes: null,
                ...buildMentionSuggestion(mentionCandidates),
              },
            }),
          ]
        : []),
    ],
    content,
    onUpdate: ({ editor: e }) => onChange(e.getHTML()),
    editorProps: {
      attributes: {
        class: "focus:outline-none min-h-[65vh] py-2",
      },
      // Pasting/dragging an image straight in, same as Notion — matched by
      // the raw file's mime type rather than trusting the drag/paste source.
      // Returning true tells ProseMirror we've handled it (no default
      // text/HTML insertion); the actual upload+insert happens async in
      // uploadAndInsertImage once it resolves.
      handlePaste: (_view, event) => {
        const files = imageFilesFrom(event.clipboardData?.files);
        if (files.length > 0 && editor) {
          event.preventDefault();
          files.forEach((file) => uploadAndInsertImage(editor, file));
          return true;
        }

        // Already inside a code block — let the default paste happen there
        // (plain text insertion at the cursor), rather than trying to
        // detect-and-rewrap something that's already exactly where it belongs.
        if (!editor || editor.isActive("codeBlock")) return false;

        const text = event.clipboardData?.getData("text/plain") ?? "";
        const fromCodeEditor = Array.from(event.clipboardData?.types ?? []).includes("vscode-editor-data");
        if (fromCodeEditor || looksLikeCode(text)) {
          event.preventDefault();
          editor
            .chain()
            .focus()
            .insertContent({ type: "codeBlock", content: text ? [{ type: "text", text }] : [] })
            .run();
          return true;
        }
        return false;
      },
      handleDrop: (view, event) => {
        const files = imageFilesFrom(event.dataTransfer?.files);
        if (files.length === 0 || !editor) return false;
        event.preventDefault();
        // Drops where the cursor was hovering, not wherever the selection
        // happened to already be — matches how drag-and-drop reads visually.
        const coords = { left: event.clientX, top: event.clientY };
        const dropPos = view.posAtCoords(coords)?.pos;
        files.forEach((file) => uploadAndInsertImage(editor, file, dropPos));
        return true;
      },
    },
  });

  // Exposes a way for TeamNoteEditor to jump to whatever an update-history
  // entry or a comment-panel click points at, without RichTextEditor having
  // to know anything about history/comments UI itself.
  useImperativeHandle(
    ref,
    () => ({
      scrollToAnchor(kind, anchorId) {
        const dom = editor?.view.dom;
        const el = dom?.querySelector<HTMLElement>(anchorSelector(kind, anchorId));
        if (!el) return;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("note-jump-flash");
        setTimeout(() => el.classList.remove("note-jump-flash"), 1400);
      },
      // Deleting a thread (see CommentsSidePanel.tsx) removes its DB row,
      // but the mark it left in the content is a separate thing entirely —
      // without this, the highlight would stay in the note forever with no
      // comment behind it. Scans the whole doc rather than relying on the
      // caller's selection, since the mark could be anywhere by the time
      // its thread gets deleted.
      removeCommentMark(threadId) {
        if (!editor) return;
        editor.commands.command(({ tr, dispatch }) => {
          const markType = editor.schema.marks.comment;
          if (!markType) return false;
          let changed = false;
          tr.doc.descendants((node, pos) => {
            if (node.marks.some((m) => m.type === markType && m.attrs.threadId === threadId)) {
              tr.removeMark(pos, pos + node.nodeSize, markType);
              changed = true;
            }
          });
          if (changed && dispatch) dispatch(tr);
          return changed;
        });
      },
      applyCommentMark(threadId, range) {
        // Collapses the selection to the end afterward — leaving it
        // spanning `range` kept the selection non-empty, which kept the
        // BubbleMenu's shouldShow true and the formatting toolbar floating
        // open (and visually overlapping the new comment card) even though
        // the user was done acting on that selection. Notion closes its own
        // toolbar the moment you comment; this matches that.
        editor?.chain().focus().setTextSelection(range).setMark("comment", { threadId }).setTextSelection(range.to).run();
      },
      getAnchorRect(kind, anchorId) {
        const dom = editor?.view.dom;
        const el = dom?.querySelector<HTMLElement>(anchorSelector(kind, anchorId));
        return el ? el.getBoundingClientRect() : null;
      },
      getViewportTopAtPos(pos) {
        if (!editor) return null;
        try {
          return editor.view.coordsAtPos(pos).top;
        } catch {
          return null;
        }
      },
    }),
    [editor],
  );

  useEffect(() => {
    if (!editor || !onCommentMarkClick) return;
    const dom = editor.view.dom;
    function handleClick(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-comment-id]");
      if (!target) return;
      const threadId = target.getAttribute("data-comment-id");
      if (threadId) onCommentMarkClick!(threadId);
    }
    dom.addEventListener("click", handleClick);
    return () => dom.removeEventListener("click", handleClick);
  }, [editor, onCommentMarkClick]);

  // Bidirectional hover, matching Notion: hovering a mark tells
  // TeamNoteEditor to highlight the matching card (onCommentMarkHover);
  // hovering a card sets hoveredThreadId, which this effect reflects back
  // onto the mark itself, in the other direction.
  useEffect(() => {
    if (!editor || !onCommentMarkHover) return;
    const dom = editor.view.dom;
    function handleOver(e: MouseEvent) {
      const target = (e.target as HTMLElement).closest<HTMLElement>("[data-comment-id]");
      const threadId = target?.getAttribute("data-comment-id") ?? null;
      onCommentMarkHover!(threadId);
    }
    function handleOut(e: MouseEvent) {
      const related = e.relatedTarget as HTMLElement | null;
      if (related?.closest("[data-comment-id]")) return;
      onCommentMarkHover!(null);
    }
    dom.addEventListener("mouseover", handleOver);
    dom.addEventListener("mouseout", handleOut);
    return () => {
      dom.removeEventListener("mouseover", handleOver);
      dom.removeEventListener("mouseout", handleOut);
    };
  }, [editor, onCommentMarkHover]);

  // Resolved/open (a DB flag on TeamNoteComment) and hovered (live mouse
  // state) are both purely transient display state, never part of the
  // document — driven into CommentMarkExtension's own plugin as decorations
  // via a meta-only transaction (docChanged stays false, so this never
  // triggers onUpdate/autosave) rather than mutating classList directly.
  // Direct DOM mutation was tried first and didn't work: ProseMirror
  // reconciles its own managed nodes on close to every transaction
  // (selection changes included, which fire constantly while BubbleMenu is
  // active) and silently reverts anything it didn't itself compute.
  useEffect(() => {
    if (!editor) return;
    const resolvedThreadIds = (comments ?? []).filter((c) => c.resolved).map((c) => c.threadId);
    editor.view.dispatch(editor.state.tr.setMeta(commentHighlightPluginKey, { resolvedThreadIds, hoveredThreadId: hoveredThreadId ?? null }));
  }, [editor, comments, hoveredThreadId]);

  if (!editor) return null;

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets picking the same file twice in a row still fire onChange
    if (!file || !editor) return;
    uploadAndInsertImage(editor, file);
  }

  return (
    // No border/box around this — Notion/Confluence/Obsidian all render the
    // document as the page itself, not a bordered card sitting on it. A
    // generous min-height keeps a mostly-empty note still reading as a full
    // page rather than a small box with dead space beneath it.
    <div>
      <EditorContent editor={editor} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChosen}
        className="hidden"
      />
      {/* Auto-shows the instant text is selected (Notion's real behavior —
          no right-click needed) and auto-hides once it isn't. shouldShow
          adds one thing on top of the plugin's own default: excludes node
          selections (e.g. clicking a noteImage to select it as a whole
          block), since Bold/Link/etc. have nothing to act on there. */}
      <BubbleMenu
        editor={editor}
        shouldShow={({ state }) => !state.selection.empty && !(state.selection instanceof NodeSelection)}
      >
        <SelectionToolbar editor={editor} onRequestComment={onRequestComment} />
      </BubbleMenu>
    </div>
  );
});

"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { useEditor, EditorContent, ReactRenderer, type Editor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import { NodeSelection } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import StarterKit from "@tiptap/starter-kit";
import Mention, { type MentionNodeAttrs } from "@tiptap/extension-mention";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Placeholder from "@tiptap/extension-placeholder";
import { TableRow, TableCell, TableHeader } from "@tiptap/extension-table";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { DocumentEmbed } from "@/components/dashboard/DocumentEmbedExtension";
import { AtMentionMenu, type AtMenuSelection } from "@/components/dashboard/AtMentionMenu";
import { NoteImage } from "@/components/dashboard/NoteImageExtension";
import { CommentMark, commentHighlightPluginKey } from "@/components/dashboard/CommentMarkExtension";
import { SlashCommand } from "@/components/dashboard/SlashCommandExtension";
import { SelectionToolbar } from "@/components/dashboard/SelectionToolbar";
import { TableGripControls } from "@/components/dashboard/TableGripControls";
import { ResizableTable } from "@/components/dashboard/TableExtension";
import { NonInclusiveLink } from "@/components/dashboard/LinkExtension";
import { createSuggestionDismissTracker } from "@/lib/tiptap-suggestion-dismiss";
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

// The "@" dropdown mentions people *and* references a portal document from
// one combined menu (Notion's own trigger does People + Link-to-page the
// same way — see AtMentionMenu.tsx for the full picker). `items()` here only
// filters the People half by label; AtMentionMenu independently manages the
// Documents half (search-as-you-type, or drill down by Team/Product/
// Category) using the raw `query` text, which is why the generic item type
// (I = MentionCandidate) and the type `command` actually receives
// (TSelected = AtMenuSelection) differ.
// Tiptap's own Mention node hardcodes its suggestion's "selected item" type
// to MentionNodeAttrs (see @tiptap/extension-mention — Mention isn't generic
// at the call site, so .configure() can't widen it). The two casts below are
// exactly that mismatch made explicit: at runtime `props.command`/`props`
// carry whatever AtMentionMenu actually passes (an AtMenuSelection, not a
// MentionNodeAttrs), since `command` is overridden immediately below to stop
// relying on Mention's own default (mention-node-only) implementation.
function buildAtMenuSuggestion(candidates: MentionCandidate[]): Partial<SuggestionOptions<MentionCandidate, MentionNodeAttrs>> {
  // See lib/tiptap-suggestion-dismiss.ts — a dismissed "@" (typed a space,
  // hit Escape, clicked away) stays permanently inert instead of reopening
  // the menu the moment the cursor comes back to sit next to it.
  const dismissTracker = createSuggestionDismissTracker();
  return {
    allow: dismissTracker.allow,
    items: ({ query }) =>
      candidates.filter((c) => c.label.toLowerCase().includes(query.toLowerCase())).slice(0, 5),
    render: () => {
      let component: ReactRenderer<{ onKeyDown: (props: { event: KeyboardEvent }) => boolean }> | undefined;
      let unmount: (() => void) | undefined;

      return {
        onStart: (props) => {
          component = new ReactRenderer(AtMentionMenu, {
            props: { people: props.items, query: props.query, command: props.command as unknown as (item: AtMenuSelection) => void },
            editor: props.editor,
          });
          unmount = props.mount(component.element as HTMLElement);
        },
        onUpdate: (props) => {
          component?.updateProps({ people: props.items, query: props.query, command: props.command as unknown as (item: AtMenuSelection) => void });
        },
        onKeyDown: (props) => component?.ref?.onKeyDown(props) ?? false,
        onExit: (props) => {
          dismissTracker.trackExit(props.range);
          unmount?.();
          component?.destroy();
        },
      };
    },
    // Overrides Mention's own default command (which only knows how to
    // insert a `mention` node) — branches on what was actually picked, since
    // a document reference is a completely different node type.
    command: ({ editor, range, props: rawSelection }) => {
      const selection = rawSelection as unknown as AtMenuSelection;
      const nodeAfter = editor.view.state.selection.$to.nodeAfter;
      const overrideSpace = nodeAfter?.text?.startsWith(" ");
      const insertRange = overrideSpace ? { from: range.from, to: range.to + 1 } : range;

      const node =
        selection.kind === "person"
          ? { type: "mention", attrs: { id: selection.id, label: selection.label, mentionSuggestionChar: "@" } }
          : { type: "documentEmbed", attrs: { documentId: selection.id } };

      editor
        .chain()
        .focus()
        .insertContentAt(insertRange, [node, { type: "text", text: " " }])
        .run();
    },
  };
}

function imageFilesFrom(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
}

// Notion detects a code paste well beyond just "counts some brackets" (it
// reads clipboard metadata a real code editor attaches), and a copy from
// VS Code specifically DOES carry an extra clipboard type ("vscode-editor-
// data") — but that turned out NOT to be the near-zero-false-positive
// signal the original version of this comment assumed: VS Code attaches it
// to every copy made from inside it, including a plain-text/markdown file
// with no code in it at all, not just actual source files. Treating it as
// an unconditional "wrap this in a code block" bypass meant pasting a
// paragraph of ordinary prose copied from a .txt file open in VS Code
// silently landed in a code block. It's now just a signal that LOWERS the
// bar for the same punctuation/keyword heuristic below (1 match instead of
// 4) rather than skipping that heuristic entirely — genuine code (even a
// short one-liner) still gets caught, but prose with zero code-shaped
// characters in it never does, regardless of where it was copied from.
// Split into two tiers, not one flat regex — STRUCTURAL_REGEX's punctuation
// essentially never appears in ordinary prose, while every keyword in
// KEYWORD_REGEX ("class," "return," "let," "var," "import," "export") is
// also a completely ordinary English word. Treating a keyword hit and a
// structural hit as equally strong evidence is what let a plain sentence
// like "You can import this design, export it as a class, and return to the
// previous screen." (4 keyword hits, zero brackets/semicolons/arrows) trip
// the density check below despite not containing a single code-shaped line —
// the same failure class as the Lorem-Ipsum/4-line-disjunct case fixed
// previously, just triggered by common-word density instead of raw length.
const STRUCTURAL_REGEX = /[{}[\];]|=>|#include|:\s*["'{]/g;
const KEYWORD_REGEX = /\bfunction\b|\bconst\b|\blet\b|\bvar\b|\bimport\b|\bexport\b|\bclass\b|\bdef\b|\breturn\b/gi;

function looksLikeCode(text: string, lenient = false): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const structural = trimmed.match(STRUCTURAL_REGEX) ?? [];
  const keywords = trimmed.match(KEYWORD_REGEX) ?? [];
  const totalMatches = structural.length + keywords.length;
  if (totalMatches < (lenient ? 1 : 4)) return false;
  const indentedLines = trimmed.split("\n").filter((l) => /^(\s{2,}|\t)/.test(l)).length;
  if (indentedLines >= 2) return true;
  // Without external confirmation this came from a code editor (lenient —
  // see the vscode-editor-data clipboard signal below), a keyword-only
  // match set is exactly the ambiguous-with-English case above — density
  // alone isn't trusted unless there's at least one unambiguous structural
  // signal backing it up. `lenient` skips this: the clipboard already told
  // us where the text came from, so a bare keyword match is enough there.
  if (!lenient && structural.length === 0) return false;
  const density = totalMatches / trimmed.length;
  return density > 0.02;
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
  // Where to insert the image the file picker (opened via the "/" menu's
  // "Insert image") returns — captured the instant the picker opens, not
  // read fresh in handleFileChosen. The native picker dialog itself can sit
  // open for an arbitrary amount of time while the user browses, during
  // which the cursor/selection can easily have moved on if they click
  // elsewhere first — by the time onChange fires, "wherever the selection
  // currently is" is no longer "where the user meant to insert this."
  const insertImageAtRef = useRef<number | null>(null);
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
      // link: false — StarterKit's own bundled Link extension can't have
      // its inclusive() method overridden through .configure() (that only
      // forwards plain options), which is what NonInclusiveLink below
      // needs to fix (see LinkExtension.tsx's own comment): typing right
      // after an existing link — even just a trailing space — was
      // inheriting the link mark, since autolink:true also makes the
      // stock extension's mark "inclusive" of its own end boundary.
      // underline isn't configured here at all — StarterKit registers it
      // by default.
      StarterKit.configure({ link: false }),
      // autolink turns a pasted or typed URL into a real <a> automatically,
      // and the same extension's setLink/unsetLink commands back the
      // selection toolbar's manual "Link" button below. openOnClick: true
      // — a link visibly auto-detects on paste but doing nothing at all on
      // a normal click read as broken, not as "use ctrl/cmd+click instead"
      // (an earlier version set this to false specifically to avoid that
      // shortcut, but it isn't a discoverable one, and target: "_blank"
      // below already means a click opens a new tab rather than
      // navigating this one away — the actual risk that guarded against
      // was smaller than it looked).
      NonInclusiveLink.configure({
        autolink: true,
        openOnClick: true,
        HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" },
      }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      DocumentEmbed,
      NoteImage,
      CommentMark,
      // Resizable columns AND a whole-table resize handle (see
      // TableGripControls' bottom-right handle, which is what the
      // ResizableTable extension's `width` attribute actually plugs into) —
      // no cell-merging UI exposed (kept simple — see the "Table"
      // slash-command item and TableGripControls, which cover insert/delete
      // row/column but not the fancier ops). ResizableTable stands in for
      // TableKit's bundled `table` sub-extension; TableRow/Cell/Header are
      // the same ones TableKit would otherwise register for you.
      ResizableTable.configure({ resizable: true }),
      TableRow,
      TableCell,
      TableHeader,
      Placeholder.configure({
        placeholder: ({ editor: e }) => (e.isEmpty ? `${placeholder ?? "Write something…"} Press '/' for commands` : ""),
      }),
      // Notion-style "/" command palette — replaces the old right-click menu
      // entirely. Same @tiptap/suggestion utility @mention already uses
      // below, just triggered by "/" and rendering block/format commands.
      SlashCommand.configure({
        onInsertImage: () => {
          insertImageAtRef.current = editor?.state.selection.to ?? null;
          fileInputRef.current?.click();
        },
      }),
      // Unconditional (not gated behind having any people to @mention) —
      // referencing a portal document via "@" is always useful, even in a
      // personal note with nobody to mention. See buildAtMenuSuggestion.
      Mention.configure({
        HTMLAttributes: { "data-type": "mention" },
        suggestion: {
          char: "@",
          // Default only allows a space right before "@" — meaning
          // "word@" (no space) silently never triggers, which reads as
          // "mentions don't work" from a real user just typing
          // naturally. null lifts that restriction entirely.
          allowedPrefixes: null,
          ...buildAtMenuSuggestion(mentionCandidates ?? []),
        },
      }),
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
          // Captured now, not read from the selection once the upload
          // resolves — uploadAndInsertImage's own upload call is async, so
          // without pinning this down here, an image pasted then followed by
          // more typing/clicking elsewhere before the network round trip
          // finishes would land wherever the cursor happened to end up
          // instead of the paste point (matches handleDrop's dropPos below,
          // which already captures its position up front for the same reason).
          const pastePos = editor.state.selection.to;
          files.forEach((file) => uploadAndInsertImage(editor, file, pastePos));
          return true;
        }

        // Already inside a code block — let the default paste happen there
        // (plain text insertion at the cursor), rather than trying to
        // detect-and-rewrap something that's already exactly where it belongs.
        if (!editor || editor.isActive("codeBlock")) return false;

        const text = event.clipboardData?.getData("text/plain") ?? "";
        const fromCodeEditor = Array.from(event.clipboardData?.types ?? []).includes("vscode-editor-data");
        if (looksLikeCode(text, fromCodeEditor)) {
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
    uploadAndInsertImage(editor, file, insertImageAtRef.current ?? undefined);
  }

  return (
    // No border/box around this — Notion/Confluence/Obsidian all render the
    // document as the page itself, not a bordered card sitting on it. A
    // generous min-height keeps a mostly-empty note still reading as a full
    // page rather than a small box with dead space beneath it.
    <div>
      <EditorContent editor={editor} />
      <TableGripControls editor={editor} />
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
          block) AND cell selections (a whole row/column selected via
          TableGripControls' grips), since Bold/Link/etc. have nothing
          sensible to act on there — a CellSelection is non-empty too, so
          without this exclusion selecting/dragging a row or column via the
          grips popped this text-formatting menu up over the table on top of
          the grips' own controls. Table row/column editing lives entirely
          in TableGripControls below instead. */}
      <BubbleMenu
        editor={editor}
        // BubbleMenuPlugin appends its element to the editor DOM's own
        // parent (see @tiptap/extension-bubble-menu's default appendTo),
        // not document.body — so without an explicit z-index it paints
        // *underneath* TeamNoteEditor's FloatingComments cards, which are a
        // separate sibling rendered later in that tree. That made this
        // toolbar's own options (Link, Comment, ...) unreachable — visually
        // covered by a comment card — the moment a selection near a comment
        // anchor opened both at once, worst-case in a table cell that sits
        // right under an existing thread. z-index alone is enough since
        // both are plain `position: absolute` elements sharing the same
        // stacking context; no portal needed.
        style={{ zIndex: 60 }}
        shouldShow={({ state }) =>
          !state.selection.empty && !(state.selection instanceof NodeSelection) && !(state.selection instanceof CellSelection)
        }
      >
        <SelectionToolbar editor={editor} onRequestComment={onRequestComment} />
      </BubbleMenu>
    </div>
  );
});

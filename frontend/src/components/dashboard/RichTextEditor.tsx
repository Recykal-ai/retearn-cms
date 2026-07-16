"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
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
import { SlashCommand } from "@/components/dashboard/SlashCommandExtension";
import { SelectionToolbar } from "@/components/dashboard/SelectionToolbar";
import { uploadNoteImageAction } from "@/app/dashboard/notes-actions";
import { useToast } from "@/components/ToastProvider";

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

export function RichTextEditor({
  content,
  onChange,
  mentionCandidates,
  placeholder,
}: {
  content: string;
  onChange: (html: string) => void;
  mentionCandidates?: MentionCandidate[];
  placeholder?: string;
}) {
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
        class: "focus:outline-none min-h-40 px-3 py-2",
      },
      // Pasting/dragging an image straight in, same as Notion — matched by
      // the raw file's mime type rather than trusting the drag/paste source.
      // Returning true tells ProseMirror we've handled it (no default
      // text/HTML insertion); the actual upload+insert happens async in
      // uploadAndInsertImage once it resolves.
      handlePaste: (_view, event) => {
        const files = imageFilesFrom(event.clipboardData?.files);
        if (files.length === 0 || !editor) return false;
        event.preventDefault();
        files.forEach((file) => uploadAndInsertImage(editor, file));
        return true;
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

  if (!editor) return null;

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets picking the same file twice in a row still fire onChange
    if (!file || !editor) return;
    uploadAndInsertImage(editor, file);
  }

  return (
    <div className="rounded-md border border-neutral-200">
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
        <SelectionToolbar editor={editor} />
      </BubbleMenu>
    </div>
  );
}

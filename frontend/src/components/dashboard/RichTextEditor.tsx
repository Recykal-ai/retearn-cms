"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import Highlight from "@tiptap/extension-highlight";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { DocumentEmbed } from "@/components/dashboard/DocumentEmbedExtension";
import { NoteImage } from "@/components/dashboard/NoteImageExtension";
import { EditorContextMenu } from "@/components/dashboard/EditorContextMenu";
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
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { show } = useToast();

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // Tiptap v3's StarterKit bundles the Link extension — autolink turns a
      // pasted or typed URL into a real <a> automatically. openOnClick:
      // false so clicking a link while editing doesn't navigate the whole
      // tab away mid-edit (still openable via the usual ctrl/cmd+click).
      StarterKit.configure({
        link: { autolink: true, openOnClick: false, HTMLAttributes: { target: "_blank", rel: "noopener noreferrer" } },
      }),
      Highlight,
      TaskList,
      TaskItem.configure({ nested: true }),
      DocumentEmbed,
      NoteImage,
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
    },
  });

  if (!editor) return null;

  function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // lets picking the same file twice in a row still fire onChange
    if (!file || !editor) return;
    const formData = new FormData();
    formData.append("file", file);
    uploadNoteImageAction(formData).then((result) => {
      if (result.error || !result.key) {
        show(result.error ?? "Failed to upload image", "error");
        return;
      }
      editor.chain().focus().insertContent({ type: "noteImage", attrs: { imageKey: result.key } }).run();
    });
  }

  return (
    // No persistent toolbar — formatting lives in the right-click menu
    // instead (Obsidian's pattern), so the editor itself stays clean. A
    // right-click on top of an existing text selection doesn't collapse it
    // in any browser, so "select, then right-click" behaves exactly like it
    // does in a native text field.
    <div
      className="rounded-md border border-neutral-200"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenuPos({ x: e.clientX, y: e.clientY });
      }}
    >
      <EditorContent editor={editor} placeholder={placeholder} />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChosen}
        className="hidden"
      />
      {menuPos && (
        <EditorContextMenu
          editor={editor}
          x={menuPos.x}
          y={menuPos.y}
          onClose={() => setMenuPos(null)}
          onInsertImage={() => fileInputRef.current?.click()}
        />
      )}
    </div>
  );
}

"use client";

import { forwardRef, useImperativeHandle, useState } from "react";
import { useEditor, EditorContent, ReactRenderer } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { DocumentEmbed } from "@/components/dashboard/DocumentEmbedExtension";

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
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      // link: false — Tiptap v3's StarterKit bundles the Link extension
      // (with autolink on) by default; explicitly disabled since this app
      // doesn't offer a hyperlink option.
      StarterKit.configure({ link: false }),
      DocumentEmbed,
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

  return (
    <div className="rounded-md border border-neutral-200">
      <div className="flex flex-wrap gap-1 border-b border-neutral-100 px-2 py-1.5">
        <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          B
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          I
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
          H1
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          • List
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1. List
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  );
}

function ToolbarButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded px-2 py-1 text-xs font-semibold"
      style={active ? { background: "var(--brand-purple-tint)", color: "var(--brand-purple)" } : { color: "#525252" }}
    >
      {children}
    </button>
  );
}

"use client";

import { Extension } from "@tiptap/core";
import type { Editor, Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { forwardRef, useImperativeHandle, useState } from "react";

export interface SlashCommandItem {
  section: string;
  label: string;
  icon: React.ReactNode;
  onSelect: (editor: Editor, range: Range) => void;
}

// Icon badge — a small square glyph, same visual weight as Notion's own
// block-type icons but hand-drawn/text-based rather than a big icon set,
// consistent with how the rest of this app builds its small inline icons
// (FileTypeIcon, CalendarIcon, etc.) rather than pulling in an icon library.
function Badge({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-500"
      style={style}
    >
      {children}
    </span>
  );
}

function ImageBadgeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.6" />
      <circle cx="8.5" cy="9.5" r="1.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M4 17l5-5 4 4 3-3 4 4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function buildItems(onInsertImage: () => void): SlashCommandItem[] {
  return [
    {
      section: "Insert",
      label: "Image",
      icon: (
        <Badge>
          <ImageBadgeIcon />
        </Badge>
      ),
      onSelect: (editor, range) => {
        editor.chain().focus().deleteRange(range).run();
        onInsertImage();
      },
    },
    {
      section: "Basic blocks",
      label: "Text",
      icon: <Badge>T</Badge>,
      onSelect: (editor, range) => editor.chain().focus().deleteRange(range).setParagraph().run(),
    },
    ...([1, 2, 3, 4, 5, 6] as const).map((level) => ({
      section: "Basic blocks",
      label: `Heading ${level}`,
      icon: <Badge>H{level}</Badge>,
      onSelect: (editor: Editor, range: Range) =>
        editor.chain().focus().deleteRange(range).toggleHeading({ level }).run(),
    })),
    {
      section: "Basic blocks",
      label: "Bulleted list",
      icon: <Badge>•</Badge>,
      onSelect: (editor, range) => editor.chain().focus().deleteRange(range).toggleBulletList().run(),
    },
    {
      section: "Basic blocks",
      label: "Numbered list",
      icon: <Badge>1.</Badge>,
      onSelect: (editor, range) => editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
    },
    {
      section: "Basic blocks",
      label: "Task list",
      icon: <Badge>☑</Badge>,
      onSelect: (editor, range) => editor.chain().focus().deleteRange(range).toggleTaskList().run(),
    },
    {
      section: "Basic blocks",
      label: "Quote",
      icon: <Badge>&ldquo;</Badge>,
      onSelect: (editor, range) => editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
    },
    {
      section: "Format",
      label: "Bold",
      icon: <Badge style={{ fontWeight: 800 }}>B</Badge>,
      onSelect: (editor, range) => editor.chain().focus().deleteRange(range).toggleBold().run(),
    },
    {
      section: "Format",
      label: "Italic",
      icon: <Badge style={{ fontStyle: "italic" }}>I</Badge>,
      onSelect: (editor, range) => editor.chain().focus().deleteRange(range).toggleItalic().run(),
    },
    {
      section: "Format",
      label: "Strikethrough",
      icon: <Badge style={{ textDecoration: "line-through" }}>S</Badge>,
      onSelect: (editor, range) => editor.chain().focus().deleteRange(range).toggleStrike().run(),
    },
    {
      section: "Format",
      label: "Highlight",
      icon: <Badge style={{ background: "#fef08a", borderColor: "#fde047" }}>H</Badge>,
      onSelect: (editor, range) => editor.chain().focus().deleteRange(range).toggleHighlight().run(),
    },
    {
      section: "Format",
      label: "Code",
      icon: <Badge style={{ fontFamily: "ui-monospace, monospace" }}>{"</>"}</Badge>,
      onSelect: (editor, range) => editor.chain().focus().deleteRange(range).toggleCode().run(),
    },
  ];
}

// Keyboard nav mirrors MentionList's exact pattern (tracked by identity
// rather than index, so a re-filtered list never points at the wrong row).
const SlashCommandList = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  { items: SlashCommandItem[]; command: (item: SlashCommandItem) => void }
>(function SlashCommandList({ items, command }, ref) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const rawIndex = items.findIndex((i) => i.label === selectedLabel);
  const selectedIndex = rawIndex === -1 ? 0 : rawIndex;

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }) {
      if (event.key === "ArrowDown") {
        const next = items[(selectedIndex + 1) % items.length];
        if (next) setSelectedLabel(next.label);
        return true;
      }
      if (event.key === "ArrowUp") {
        const next = items[(selectedIndex - 1 + items.length) % items.length];
        if (next) setSelectedLabel(next.label);
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
    return (
      <div
        className="w-56 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-400 shadow-lg"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        No matching commands
      </div>
    );
  }

  let lastSection = "";

  return (
    <div
      className="max-h-80 w-56 overflow-y-auto rounded-md border border-neutral-200 bg-white py-1.5 shadow-lg"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      {items.map((item, i) => {
        const showHeader = item.section !== lastSection;
        lastSection = item.section;
        return (
          <div key={item.label}>
            {showHeader && (
              <p className="mt-1.5 mb-1 px-3 text-[10px] font-semibold tracking-wide text-neutral-400 uppercase first:mt-0">
                {item.section}
              </p>
            )}
            <button
              type="button"
              onClick={() => command(item)}
              className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm"
              style={i === selectedIndex ? { background: "var(--brand-purple-tint)" } : undefined}
            >
              {item.icon}
              <span className="text-neutral-700">{item.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
});

// A Notion-style "/" command palette — replaces the old right-click menu
// entirely. Built on the same @tiptap/suggestion utility the @mention
// feature already uses, just triggered by "/" instead of "@" and rendering
// block-type/format commands instead of people.
export const SlashCommand = Extension.create<{ onInsertImage: () => void }>({
  name: "slashCommand",

  addOptions() {
    return { onInsertImage: () => {} };
  },

  addProseMirrorPlugins() {
    const items = buildItems(this.options.onInsertImage);
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        char: "/",
        // No allowedPrefixes override here (unlike @mention below, which
        // deliberately lifts it) — the default (only a space or start-of-
        // line immediately before "/") is exactly what's wanted: "abcdef/"
        // typed mid-word must never open the menu, only "abcdef /" or "/"
        // at the start of a line, matching Notion's own behavior.
        command: ({ editor, range, props }) => props.onSelect(editor, range),
        items: ({ query }) => items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase())),
        render: () => {
          let component: ReactRenderer<{ onKeyDown: (props: { event: KeyboardEvent }) => boolean }> | undefined;
          let unmount: (() => void) | undefined;

          return {
            onStart: (props) => {
              component = new ReactRenderer(SlashCommandList, {
                props: { items: props.items, command: props.command },
                editor: props.editor,
              });
              unmount = props.mount(component.element as HTMLElement);
            },
            onUpdate: (props) => {
              component?.updateProps({ items: props.items, command: props.command });
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") return true;
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: () => {
              unmount?.();
              component?.destroy();
            },
          };
        },
      }),
    ];
  },
});

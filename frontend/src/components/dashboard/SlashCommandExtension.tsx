"use client";

import { Extension } from "@tiptap/core";
import type { Editor, Range } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { forwardRef, useImperativeHandle, useState } from "react";
import { Icon } from "@/components/dashboard/Icon";
import { createSuggestionDismissTracker } from "@/lib/tiptap-suggestion-dismiss";

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
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
      style={style}
    >
      {children}
    </span>
  );
}

function buildItems(onInsertImage: () => void): SlashCommandItem[] {
  return [
    {
      section: "Insert",
      label: "Image",
      icon: (
        <Badge>
          <Icon name="Media/Image_01" size={14} />
        </Badge>
      ),
      onSelect: (editor, range) => {
        editor.chain().focus().deleteRange(range).run();
        onInsertImage();
      },
    },
    {
      section: "Insert",
      label: "Table",
      icon: (
        <Badge>
          <Icon name="Edit/Table" size={14} />
        </Badge>
      ),
      // A plain 3x3 starting grid, matching Notion's own default — Notion's
      // simple table has no header styling until you explicitly turn on
      // "Header column"/"Header row" from a grip's menu (see
      // TableGripControls.tsx), so a table shouldn't start pre-styled either.
      onSelect: (editor, range) =>
        editor.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: false }).run(),
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
      label: "Inline code",
      icon: <Badge style={{ fontFamily: "ui-monospace, monospace" }}>{"</>"}</Badge>,
      onSelect: (editor, range) => editor.chain().focus().deleteRange(range).toggleCode().run(),
    },
    {
      // A separate, block-level command from "Inline code" above — toggleCode()
      // only wraps a text *selection* in the inline <code> mark, which is a
      // no-op with nothing selected (the reported bug: picking "Code" on an
      // empty new line visibly did nothing). toggleCodeBlock() is the actual
      // block command, matching Notion's own "Code" — see CodeBlockExtension.tsx
      // for the block's own dark card + language/copy toolbar.
      section: "Basic blocks",
      label: "Code",
      icon: (
        <Badge style={{ fontFamily: "ui-monospace, monospace", background: "#2b2b2b", borderColor: "#2b2b2b", color: "#e5e5e5" }}>
          {"</>"}
        </Badge>
      ),
      onSelect: (editor, range) => editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
    },
  ];
}

// Keyboard nav mirrors AtMentionMenu's exact pattern (tracked by identity
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
        className="w-56 rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-400 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-500"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        No matching commands
      </div>
    );
  }

  let lastSection = "";

  return (
    <div
      className="max-h-80 w-56 overflow-y-auto rounded-md border border-neutral-200 bg-white py-1.5 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      {items.map((item, i) => {
        const showHeader = item.section !== lastSection;
        lastSection = item.section;
        return (
          <div key={item.label}>
            {showHeader && (
              <p className="mt-1.5 mb-1 px-3 text-[10px] font-semibold tracking-wide text-neutral-400 uppercase first:mt-0 dark:text-neutral-500">
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
              <span className="text-neutral-700 dark:text-neutral-300">{item.label}</span>
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
    // See lib/tiptap-suggestion-dismiss.ts — makes a dismissed "/" (typed a
    // space, hit Escape, clicked away) stay permanently inert instead of
    // reopening the menu the moment the cursor comes back to sit next to it.
    const dismissTracker = createSuggestionDismissTracker();
    return [
      Suggestion<SlashCommandItem>({
        editor: this.editor,
        char: "/",
        // No allowedPrefixes override here (unlike @mention below, which
        // deliberately lifts it) — the default (only a space or start-of-
        // line immediately before "/") is exactly what's wanted: "abcdef/"
        // typed mid-word must never open the menu, only "abcdef /" or "/"
        // at the start of a line, matching Notion's own behavior.
        allow: dismissTracker.allow,
        command: ({ editor, range, props }) => props.onSelect(editor, range),
        items: ({ query }) => items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase())),
        render: () => {
          let component: ReactRenderer<{ onKeyDown: (props: { event: KeyboardEvent }) => boolean }> | undefined;
          let unmount: (() => void) | undefined;

          return {
            onStart: (props) => {
              // Deferred by a microtask — same fix, same reason as
              // AtMentionMenu's suggestion in RichTextEditor.tsx: ReactRenderer's
              // constructor calls flushSync() synchronously once the editor is
              // mounted, which trips React's "flushSync called while already
              // rendering" warning when onStart fires from inside a React
              // commit phase (as it does here, via ProseMirror's transaction
              // dispatch). See that file's comment for the full explanation.
              queueMicrotask(() => {
                component = new ReactRenderer(SlashCommandList, {
                  props: { items: props.items, command: props.command },
                  editor: props.editor,
                });
                unmount = props.mount(component.element as HTMLElement);
              });
            },
            onUpdate: (props) => {
              component?.updateProps({ items: props.items, command: props.command });
            },
            onKeyDown: (props) => {
              if (props.event.key === "Escape") return true;
              return component?.ref?.onKeyDown(props) ?? false;
            },
            onExit: (props) => {
              dismissTracker.trackExit(props.range);
              unmount?.();
              component?.destroy();
            },
          };
        },
      }),
    ];
  },
});

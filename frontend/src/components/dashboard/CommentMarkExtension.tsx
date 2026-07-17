"use client";

import { Mark, mergeAttributes } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export const commentHighlightPluginKey = new PluginKey<CommentHighlightState>("commentHighlight");

export interface CommentHighlightState {
  hoveredThreadId: string | null;
  resolvedThreadIds: string[];
}

// Wraps commented text with data-comment-id="<thread root comment id>" —
// written once when a comment thread is created (see FloatingComments.tsx's
// submitDraft flow) and never touched again structurally. Resolved/open and
// hovered are both purely transient display state (never part of the
// document), so they're carried as ProseMirror Decorations driven by this
// plugin's own state, not as classList mutations applied directly to the
// rendered DOM from a React useEffect — that was tried first and silently
// lost the class almost immediately: ProseMirror's view reconciles its own
// managed DOM on essentially every transaction (selection changes included,
// which fire constantly while the BubbleMenu/hover machinery is active),
// and anything mutated outside of what the view itself computed (decorations
// included) gets stomped on the next redraw. Decorations don't have that
// problem since the view recomputes and reapplies them itself every time.
export const CommentMark = Mark.create({
  name: "comment",

  // Without this, ProseMirror treats a cursor sitting right at the end of
  // the mark as still "inside" it — so typing there (or pressing Enter,
  // which carries the same boundary marks into the new paragraph) silently
  // extends the highlight into text that was never actually commented on.
  // Same reason `link`/`code` set this false in every real editor.
  inclusive: false,

  addAttributes() {
    return {
      threadId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-comment-id"),
        renderHTML: (attrs) => (attrs.threadId ? { "data-comment-id": attrs.threadId } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "note-comment-mark" }), 0];
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<CommentHighlightState>({
        key: commentHighlightPluginKey,
        state: {
          init: (): CommentHighlightState => ({ hoveredThreadId: null, resolvedThreadIds: [] }),
          apply(tr, value) {
            const meta = tr.getMeta(commentHighlightPluginKey) as Partial<CommentHighlightState> | undefined;
            return meta ? { ...value, ...meta } : value;
          },
        },
        props: {
          decorations(state) {
            const pluginState = commentHighlightPluginKey.getState(state);
            if (!pluginState || (!pluginState.hoveredThreadId && pluginState.resolvedThreadIds.length === 0)) {
              return DecorationSet.empty;
            }
            const decorations: Decoration[] = [];
            state.doc.descendants((node, pos) => {
              if (!node.isText) return;
              const mark = node.marks.find((m) => m.type.name === "comment");
              if (!mark) return;
              const threadId = mark.attrs.threadId as string;
              const classes: string[] = [];
              if (pluginState.resolvedThreadIds.includes(threadId)) classes.push("resolved");
              if (pluginState.hoveredThreadId === threadId) classes.push("hovered");
              if (classes.length > 0) {
                decorations.push(Decoration.inline(pos, pos + node.nodeSize, { class: classes.join(" ") }));
              }
            });
            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});

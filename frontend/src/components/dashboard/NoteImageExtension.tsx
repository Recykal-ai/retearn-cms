"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { getNoteImageViewUrlAction } from "@/app/dashboard/notes-actions";

function NoteImageView({ node }: ReactNodeViewProps<HTMLElement>) {
  const imageKey = node.attrs.imageKey as string;
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getNoteImageViewUrlAction(imageKey)
      .then((r) => {
        if (!cancelled) setUrl(r.url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [imageKey]);

  // data-image-key here (not just in renderHTML's serialized form below) is
  // what the update-history "jump to" feature queries for in the live DOM —
  // see RichTextEditor.tsx's scrollToAnchor.
  if (failed) {
    return (
      <NodeViewWrapper as="div" className="my-2" data-image-key={imageKey} contentEditable={false}>
        <div className="flex h-32 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-xs text-neutral-400">
          Image unavailable
        </div>
      </NodeViewWrapper>
    );
  }

  if (!url) {
    return (
      <NodeViewWrapper as="div" className="my-2" data-image-key={imageKey} contentEditable={false}>
        <div className="flex h-32 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-xs text-neutral-400">
          Loading image…
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as="div" className="my-2" data-image-key={imageKey} contentEditable={false}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt="" className="max-h-96 max-w-full rounded-md border border-neutral-200" draggable={false} />
    </NodeViewWrapper>
  );
}

// An atom block node — only the storage key is persisted, same reasoning as
// DocumentEmbed: a signed URL expires in minutes, long before the note
// itself does, so the actual URL is re-resolved live on every render
// instead of ever being written into stored HTML.
export const NoteImage = Node.create({
  name: "noteImage",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      imageKey: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-image-key"),
        renderHTML: (attrs) => ({ "data-image-key": attrs.imageKey }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[data-type="note-image"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, { "data-type": "note-image" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(NoteImageView);
  },
});

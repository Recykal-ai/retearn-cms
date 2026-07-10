"use client";

import { Node, mergeAttributes, nodePasteRule } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { getDocumentAction } from "@/app/dashboard/documents-actions";
import type { DocumentSummary } from "@/lib/api";
import { fileTypeOf } from "@/lib/file-type";
import { FileTypeIcon } from "@/components/dashboard/FileTypeIcon";
import { StatusDot } from "@/components/dashboard/StatusDot";

// Matches the exact link shape DocumentRowMenu's "Share (copy link)" produces
// (`${origin}/dashboard?doc=<uuid>`) — see DocumentRowMenu.tsx. Requires a
// protocol so we don't accidentally match unrelated pasted text that happens
// to contain "/dashboard?doc=".
const DOC_LINK_REGEX =
  /https?:\/\/\S*?\/dashboard(?:\/\S*)?\?(?:\S*&)?doc=([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})(?:&\S*)?/g;

function DocumentEmbedView({ node }: ReactNodeViewProps<HTMLElement>) {
  const documentId = node.attrs.documentId as string;
  const [doc, setDoc] = useState<DocumentSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    getDocumentAction(documentId)
      .then((d) => {
        if (!cancelled) setDoc(d);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (failed) {
    return (
      <NodeViewWrapper as="span" className="inline-block align-middle" contentEditable={false}>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-400">
          Document unavailable
        </span>
      </NodeViewWrapper>
    );
  }

  if (!doc) {
    return (
      <NodeViewWrapper as="span" className="inline-block align-middle" contentEditable={false}>
        <span className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 bg-neutral-50 px-2.5 py-1 text-xs text-neutral-400">
          Loading document…
        </span>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as="span" className="inline-block align-middle" contentEditable={false}>
      <button
        type="button"
        onClick={() => router.push(`${pathname}?doc=${doc.id}`)}
        className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700 shadow-sm hover:border-neutral-300 hover:bg-neutral-50"
      >
        <FileTypeIcon type={fileTypeOf(doc.title, doc.sourceType)} />
        <span className="truncate">{doc.title}</span>
        <StatusDot status={doc.status} recentlyPublished={doc.recentlyPublished} />
      </button>
    </NodeViewWrapper>
  );
}

// An atom, inline node — pasting a document's share link (copied via
// DocumentRowMenu) replaces the raw URL text with this chip instead, same
// spirit as the @mention pill. Only the documentId is persisted; title/status
// are fetched live on render so the chip never goes stale if the doc is
// renamed (new version, different filename) or its status changes.
export const DocumentEmbed = Node.create({
  name: "documentEmbed",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      documentId: {
        default: null,
        parseHTML: (el) => el.getAttribute("data-id"),
        renderHTML: (attrs) => ({ "data-id": attrs.documentId }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-type="document-embed"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes, { "data-type": "document-embed" })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(DocumentEmbedView);
  },

  addPasteRules() {
    return [
      nodePasteRule({
        find: DOC_LINK_REGEX,
        type: this.type,
        getAttributes: (match) => ({ documentId: match[1] }),
      }),
    ];
  },
});

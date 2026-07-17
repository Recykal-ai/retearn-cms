import { JSDOM } from "jsdom";
import { sanitizeNoteHtml } from "./sanitize-html.js";

// Structured "what changed" helpers for TeamNote's update-history feature
// (see team-notes.ts's PUT /:id). Deliberately NOT a generic text diff —
// per project decision, plain text/formatting edits collapse into one
// generic EDITED_CONTENT activity row; only structural insertions (images,
// linked documents) get their own specific, jump-to-able entries. All three
// helpers parse with jsdom (like extractMentionIds) rather than regex, since
// Tiptap's rendered attribute order/spacing isn't guaranteed.

export function extractImageKeys(html: string): string[] {
  const dom = new JSDOM(sanitizeNoteHtml(html));
  const keys = new Set<string>();
  dom.window.document.querySelectorAll('img[data-type="note-image"]').forEach((el) => {
    const key = el.getAttribute("data-image-key");
    if (key) keys.add(key);
  });
  return [...keys];
}

export function extractDocumentEmbedIds(html: string): string[] {
  const dom = new JSDOM(sanitizeNoteHtml(html));
  const ids = new Set<string>();
  dom.window.document.querySelectorAll('span[data-type="document-embed"]').forEach((el) => {
    const id = el.getAttribute("data-id");
    if (id) ids.add(id);
  });
  return [...ids];
}

// Strips the structural nodes (images, document embeds) out of the HTML
// before comparing old vs new content, so an image-only or link-only save
// doesn't *also* produce a redundant "edited the note" entry alongside its
// own specific ADDED_IMAGE/LINKED_DOCUMENT one. Comment marks are unwrapped
// (kept as plain text) rather than removed, for the same reason — applying
// the CommentMark to a selection (see SelectionToolbar.tsx's confirmComment)
// changes the HTML without changing what a reader would call "the text,"
// and it's already logged as its own ADDED_COMMENT entry by the comment
// route, so it shouldn't also register as a generic content edit here.
export function stripStructuralNodes(html: string): string {
  const dom = new JSDOM(sanitizeNoteHtml(html));
  const { document } = dom.window;
  document.querySelectorAll('img[data-type="note-image"], span[data-type="document-embed"]').forEach((el) => el.remove());
  document.querySelectorAll("span[data-comment-id]").forEach((el) => el.replaceWith(...Array.from(el.childNodes)));
  return document.body.innerHTML;
}

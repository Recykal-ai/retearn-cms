import DOMPurify from "isomorphic-dompurify";
import { JSDOM } from "jsdom";

// Explicit allow-list rather than DOMPurify's defaults — this only ever needs
// to hold what our own Tiptap editor (StarterKit + Mention) actually emits,
// so keeping it narrow means anything unexpected gets stripped rather than
// silently allowed through as the library's defaults happen to change later.
const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "b", "i", "u",
  "h1", "h2", "h3",
  "ul", "ol", "li",
  "blockquote",
  "span",
];
const ALLOWED_ATTR = ["data-type", "data-id", "data-label", "data-mention-suggestion-char"];

export function sanitizeNoteHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}

// Parses with a real DOM (jsdom) rather than a regex — attribute order and
// spacing in Tiptap's rendered mention spans aren't guaranteed, so a regex
// would be fragile in a way a real parser isn't.
export function extractMentionIds(html: string): string[] {
  const dom = new JSDOM(sanitizeNoteHtml(html));
  const spans = dom.window.document.querySelectorAll('span[data-type="mention"]');
  const ids = new Set<string>();
  spans.forEach((el) => {
    const id = el.getAttribute("data-id");
    if (id) ids.add(id);
  });
  return [...ids];
}

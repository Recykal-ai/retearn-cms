import DOMPurify from "isomorphic-dompurify";
import { JSDOM } from "jsdom";

// Explicit allow-list rather than DOMPurify's defaults — this only ever needs
// to hold what our own Tiptap editor (StarterKit + Mention + Highlight +
// TaskList/TaskItem) actually emits, so keeping it narrow means anything
// unexpected gets stripped rather than silently allowed through as the
// library's defaults happen to change later.
const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "b", "i", "u", "s", "mark", "code",
  "h1", "h2", "h3", "h4", "h5", "h6",
  "ul", "ol", "li",
  "blockquote",
  "span",
  // Task list markup — Tiptap renders <ul data-type="taskList"><li
  // data-type="taskItem" data-checked><label><input type="checkbox"
  // checked?><span/></label><div>content</div></li></ul>.
  "label", "input", "div",
  "a", // autolinked URLs (Tiptap's Link extension)
  // <img data-type="note-image" data-image-key="…"> — deliberately never
  // carries a real `src` in stored HTML (that would be a signed URL, which
  // expires long before the note does); the editor's NoteImage NodeView
  // re-resolves a fresh signed URL from the key at render time instead.
  "img",
];
const ALLOWED_ATTR = [
  "data-type", "data-id", "data-label", "data-mention-suggestion-char",
  "data-checked", "type", "checked",
  "href", "target", "rel",
  "data-image-key",
];

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

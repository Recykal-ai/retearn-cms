import DOMPurify from "isomorphic-dompurify";
import { JSDOM } from "jsdom";

// Explicit allow-list rather than DOMPurify's defaults — this only ever needs
// to hold what our own Tiptap editor (StarterKit + Mention + Highlight +
// TaskList/TaskItem) actually emits, so keeping it narrow means anything
// unexpected gets stripped rather than silently allowed through as the
// library's defaults happen to change later.
const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "b", "i", "u", "s", "mark", "code",
  // Multi-line code blocks (auto-detected on paste — see
  // RichTextEditor.tsx's looksLikeCode — or inserted via the "/" menu).
  // Tiptap's CodeBlock renders <pre><code>…</code></pre>; without "pre"
  // here DOMPurify would strip the wrapper and the block would collapse
  // back into an unstyled inline <code> run, losing its line breaks.
  "pre",
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
  // Tables (@tiptap/extension-table, added well after this allow-list was
  // first written — tables were silently getting stripped on every save
  // and only ever appeared to work because the in-memory editor state
  // still showed them until the next reload). "colgroup"/"col" are
  // deliberately NOT here — TableView constructs those itself, imperatively,
  // on every render (see TableExtension.tsx); they're never part of the
  // schema's own toDOM output, so editor.getHTML() never emits them and
  // there's nothing to allow-list.
  "table", "tbody", "tr", "th", "td",
];
const ALLOWED_ATTR = [
  "data-type", "data-id", "data-label", "data-mention-suggestion-char",
  "data-checked", "type", "checked",
  "href", "target", "rel",
  "data-image-key",
  // <span data-comment-id="…"> — see CommentMarkExtension.tsx. Written once
  // at comment-creation time and never touched again (resolve/reopen only
  // update the TeamNoteComment row, never this mark), so it needs no
  // "resolved" attribute counterpart.
  "data-comment-id",
  // Table structure/sizing — colspan/rowspan/colwidth are plain HTML
  // attributes @tiptap/extension-table's TableCell renders directly (see
  // its addAttributes()); "style" is TableExtension.tsx's ResizableTable
  // persisting a corner-drag width as `style="width: …px"` on the <table>
  // element itself, the only place this editor ever emits a style attr.
  "colspan", "rowspan", "colwidth", "style",
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

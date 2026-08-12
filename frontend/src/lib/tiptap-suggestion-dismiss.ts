import type { Editor, Range } from "@tiptap/core";

// Replicates Notion/Confluence's real "/" and "@" behavior: once a
// suggestion menu closes WITHOUT completing a selection — Escape, typing a
// space, or just moving the cursor away — that specific "/" or "@" becomes
// permanently inert plain text. Coming back and placing the cursor right
// after it again must never reopen the menu; the user can type "/anything"
// there like it's any other character.
//
// @tiptap/suggestion (see node_modules/@tiptap/suggestion/dist/index.js)
// already tracks a `dismissedRange` internally, but only for a much
// narrower case: it's set when Escape triggers `dispatchExit`, and gets
// unconditionally cleared the instant the cursor sits somewhere that
// doesn't currently form a matchable range (`if (!match) dismissedRange =
// null`) — which is exactly what happens the moment you type a space or
// click away. So it forgets a dismissal as soon as you leave, and happily
// reopens if you come back. This tracks dismissed trigger positions
// ourselves, independently, and keeps them remembered — remapped through
// edits via `transaction.mapping` — until that position is actually deleted
// from the document.
export function createSuggestionDismissTracker() {
  let dismissed = new Set<number>();
  let registered = false;

  function ensureRegistered(editor: Editor) {
    if (registered) return;
    registered = true;
    editor.on("transaction", ({ transaction }) => {
      if (!transaction.docChanged || dismissed.size === 0) return;
      const next = new Set<number>();
      dismissed.forEach((pos) => next.add(transaction.mapping.map(pos)));
      dismissed = next;
    });
  }

  return {
    allow({ editor, range }: { editor: Editor; range: Range }) {
      ensureRegistered(editor);
      return !dismissed.has(range.from);
    },
    // Call from render().onExit with the range the suggestion was just
    // showing at. Safe to call even when it closed because an item WAS
    // selected — the trigger text gets replaced by the inserted node, so
    // there's nothing left at that position to ever re-match against anyway.
    trackExit(range: Range) {
      dismissed.add(range.from);
    },
  };
}

// Notion never opens "/" or "@" while typing inside a code block — code text
// is meant to stay literal, not trigger rich-text pickers mid-snippet. Meant
// to be ANDed with dismissTracker.allow (or used alone) as a Suggestion's
// `allow` option: `allow: (props) => dismissTracker.allow(props) &&
// notInCodeBlock(props)`.
export function notInCodeBlock({ editor }: { editor: Editor }): boolean {
  return !editor.isActive("codeBlock");
}

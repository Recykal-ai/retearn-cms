import Link from "@tiptap/extension-link";

// @tiptap/extension-link ties its own mark "inclusive"-ness directly to
// autolink (see its source: `inclusive() { return this.options.autolink }`)
// — needed internally so a URL being typed character-by-character keeps
// picking up the mark as autolink detection catches up to it, but the same
// setting also means typing immediately AFTER an already-formed link (even
// just a trailing space) keeps inheriting the Link mark, since the cursor
// sitting at the mark's own end boundary counts as "inside" it once
// inclusive is true. That's not something StarterKit.configure({link: {…}})
// can override — it only forwards options to the extension, not the
// extension's own inclusive() method — so this replaces it with a version
// that's always non-inclusive regardless of autolink, the same way
// TableExtension.tsx replaces the table sub-extension for a customization
// its own config options don't expose. autolink's own detection is a
// separate mechanism (a transaction/input-rule matching URL text and
// applying the mark to that specific range) untouched by this — only
// whether newly-typed content AT an existing link's boundary keeps it.
export const NonInclusiveLink = Link.extend({
  inclusive() {
    return false;
  },
});

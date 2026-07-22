import { Table } from "@tiptap/extension-table";

// @tiptap/extension-table's own Table node has no persisted attributes at
// all by default — but its TableView (node_modules/@tiptap/extension-table/
// dist/table/index.js, updateColumns()) already checks for a `style`
// attribute containing "width:" on the table node's own attrs and, if
// present, respects it instead of auto-computing the table's width from its
// columns every time the view updates. That mechanism just isn't wired up to
// anything by default — this extends Table with a persisted `style`
// attribute purely to plug into that existing check. Important: it has to
// be named exactly `style` (not e.g. `width`, rendered into a style string)
// — TableView's check reads `node.attrs.style` directly on every live
// update, not just at initial parse/render, so anything else gets correctly
// applied on mount and then silently overwritten the next time the table
// re-renders. TableGripControls' whole-table resize handle is what actually
// sets it.
export const ResizableTable = Table.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      style: {
        default: null,
        parseHTML: (element) => (element as HTMLElement).getAttribute("style"),
        renderHTML: (attributes) => (attributes.style ? { style: attributes.style as string } : {}),
      },
    };
  },
});

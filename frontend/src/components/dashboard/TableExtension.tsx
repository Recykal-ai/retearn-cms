import { Table, TableCell, TableHeader } from "@tiptap/extension-table";

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

// A per-cell background tint (Notion's grip-menu "Color" item, applied to
// every cell in a column/row at once — see TableGripControls' setColor).
// Stored as a raw CSS color value on the cell node itself, rendered as an
// inline background-color — Tiptap's own mergeAttributes concatenates this
// with any other attribute's "style" output (there isn't one on cells today,
// but this doesn't assume that stays true).
const backgroundAttr = {
  background: {
    default: null,
    parseHTML: (element: HTMLElement) => element.style.backgroundColor || null,
    renderHTML: (attributes: Record<string, unknown>) =>
      attributes.background ? { style: `background-color: ${attributes.background as string}` } : {},
  },
};

export const ColorableTableCell = TableCell.extend({
  addAttributes() {
    return { ...this.parent?.(), ...backgroundAttr };
  },
});

export const ColorableTableHeader = TableHeader.extend({
  addAttributes() {
    return { ...this.parent?.(), ...backgroundAttr };
  },
});

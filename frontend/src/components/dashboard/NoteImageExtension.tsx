"use client";

import { Node, mergeAttributes } from "@tiptap/core";
import { ReactNodeViewRenderer, NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import { findTable, TableMap, updateColumnsOnResize } from "@tiptap/pm/tables";
import { useEffect, useRef, useState } from "react";
import { getNoteImageViewUrlAction } from "@/app/dashboard/notes-actions";
import { Icon } from "@/components/dashboard/Icon";

const MIN_IMAGE_WIDTH = 80;
// A generous sanity bound for the LIVE drag only — not a real ceiling. If
// the image is inside a table cell and ends up wider than the cell, the
// column is grown to match on release (see growColumnToFit below); this is
// just what stops the drag itself from producing an absurd value before
// that decision is made.
const IMAGE_DRAG_MAX_WIDTH = 2000;
// Matches prosemirror-tables' own columnResizing({ defaultCellMinWidth })
// default (25/25/100 — see its own source) — this table isn't configured
// with a custom value, so this just keeps the live preview's own math
// consistent with what the library would compute for the same column.
const DEFAULT_CELL_MIN_WIDTH = 100;

// Finds which table column (if any) an image at `pos` sits inside, so its
// resize handle can grow that column to match rather than being capped by
// it — see startResize's own comment for why a hard cap was the wrong call.
function findColumnContext(editor: Editor, pos: number) {
  const { state } = editor.view;
  const $pos = state.doc.resolve(pos);
  const found = findTable($pos);
  if (!found) return null;
  let cellDepth = -1;
  for (let d = $pos.depth; d > 0; d--) {
    const name = $pos.node(d).type.name;
    if (name === "tableCell" || name === "tableHeader") {
      cellDepth = d;
      break;
    }
  }
  if (cellDepth === -1) return null;
  const cellPos = $pos.before(cellDepth);
  const map = TableMap.get(found.node);
  const colIndex = map.colCount(cellPos - found.start);
  return { tableNode: found.node, tablePos: found.pos, tableStart: found.start, colIndex };
}

// Sets one column's width across every row — mirrors prosemirror-tables'
// own (unexported) updateColumnWidth, the same thing dragging the table's
// own purple resize line does, so this composes correctly with
// TableGripControls' existing per-column-resize handling (including
// clearing/redistributing a whole-table corner-resize style if one's set —
// see that file's reconcileAllTables).
function growColumnToFit(tr: Transaction, table: ProseMirrorNode, tableStart: number, colIndex: number, width: number) {
  const map = TableMap.get(table);
  for (let row = 0; row < map.height; row++) {
    const mapIndex = row * map.width + colIndex;
    if (row && map.map[mapIndex] === map.map[mapIndex - map.width]) continue;
    const pos = map.map[mapIndex];
    const cell = table.nodeAt(pos);
    if (!cell) continue;
    const index = cell.attrs.colspan === 1 ? 0 : colIndex - map.colCount(pos);
    const colwidth = cell.attrs.colwidth ? (cell.attrs.colwidth as number[]).slice() : new Array(cell.attrs.colspan).fill(0);
    if (colwidth[index] === width) continue;
    colwidth[index] = width;
    tr.setNodeMarkup(tableStart + pos, undefined, { ...cell.attrs, colwidth });
  }
}

function NoteImageView({ node, updateAttributes, deleteNode, editor, getPos }: ReactNodeViewProps<HTMLElement>) {
  const imageKey = node.attrs.imageKey as string;
  const width = node.attrs.width as number | null;
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  // True for the duration of a resize drag — see startResize's onMouseLeave
  // guard below for why this exists: the cursor drifting outside the
  // wrapper's bounds mid-drag (very likely once you're actively resizing)
  // would otherwise flip `hovered` to false and re-render, and since the
  // <img>'s style prop is React-controlled, that re-render reset the
  // element's inline width back to the stale pre-drag node.attrs.width —
  // fighting the direct DOM write onMove was making every frame. That
  // fight was the "snapping, not smooth" symptom.
  const resizingRef = useRef(false);

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

  // Drags the image's own bottom-right corner, same pattern as
  // TableGripControls' whole-table resize handle. NOT capped to its
  // container — an earlier version hard-clamped to the containing cell's
  // width, which meant enlarging an image inside a table meant resizing
  // the column FIRST and only then the image, two separate steps for what
  // should be one gesture. Now: when inside a table cell, the column
  // stays in sync with the image in BOTH directions (grow AND shrink) —
  // LIVE, on every move, not just on release — using
  // updateColumnsOnResize, prosemirror-tables' own EXPORTED live-preview
  // function (the exact one its native column-resize handle calls on
  // every native mousemove — see @tiptap/pm/tables). That's what keeps
  // this cheap: it only touches the DOM (colgroup <col> widths, the
  // table's own width/min-width), no transaction dispatched until release,
  // so it can't fight @tiptap/extension-table's own updateColumns() the
  // way a real per-move transaction would. The actual colwidth is only
  // committed once, on release (growColumnToFit) — same outcome as
  // dragging the column's own purple resize line, just triggered from the
  // image and kept visually in sync with it the whole time instead of only
  // catching up at the end.
  function startResize(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!imgRef.current) return;
    const imgEl: HTMLImageElement = imgRef.current;
    const startX = e.clientX;
    const startWidth = imgEl.getBoundingClientRect().width;
    resizingRef.current = true;
    // max-w-full (below) hard-caps the rendered width at 100% of the
    // container regardless of what inline width says — during a normal,
    // non-dragging render that's exactly what's wanted (an unresized image
    // never overflows its cell), but it also meant the live drag could
    // never visibly exceed the container at all: onMove's direct width
    // write was being clamped by the browser itself the instant it crossed
    // that boundary, reading as the drag being stuck/snapping rather than
    // following the cursor. Overridden here for the drag's duration only —
    // once a width is actually committed (see onUp), the image's size is
    // under that attribute's control from then on anyway, so there's
    // nothing to restore this to afterward. max-h-96 (a flat 384px cap
    // wholly unrelated to the image's own aspect ratio) gets the same
    // treatment — otherwise, since className stays at its pre-drag value
    // until the drag actually commits, the live preview itself could
    // squash/stretch the image the instant its resized-width-implied
    // height crossed 384px, before the drag was even released.
    imgEl.style.maxWidth = "none";
    imgEl.style.maxHeight = "none";

    // Computed ONCE, at drag start — the column/table this image sits in
    // doesn't change mid-drag, so there's no need to re-resolve it on
    // every move.
    const startPos = typeof getPos === "function" ? getPos() : null;
    const ctx = typeof startPos === "number" ? findColumnContext(editor, startPos) : null;
    const tableDom = ctx ? (editor.view.nodeDOM(ctx.tablePos) as HTMLElement | null) : null;
    const tableEl = tableDom?.querySelector("table") ?? null;
    const colgroupEl = tableEl?.querySelector("colgroup") ?? null;
    // Inside a table, a wide image can grow its column past the note's own
    // margin the same as any other column-driven overflow — .tableWrapper's
    // own overflow-x: auto (see globals.css) catches that with a
    // scrollbar. A bare image in ordinary note text has no such wrapper:
    // once max-w-full stops applying (the moment a width is committed —
    // see the className below), nothing would stop it from rendering wider
    // than the content column and overflowing the page's own margin with
    // no scrollbar to contain it. Capped to the content column's own width
    // in that case only.
    const columnWidth = ctx
      ? null
      : imgEl.closest<HTMLElement>("[data-notes-content-column]")?.getBoundingClientRect().width;
    function clamp(w: number) {
      const ceiling = columnWidth && columnWidth > 0 ? Math.min(IMAGE_DRAG_MAX_WIDTH, columnWidth) : IMAGE_DRAG_MAX_WIDTH;
      return Math.round(Math.min(ceiling, Math.max(MIN_IMAGE_WIDTH, w)));
    }
    // colwidth controls the CELL's own border-box width (td/th are
    // box-sizing: border-box — see globals.css), which includes the cell's
    // padding — but the image's own width is its CONTENT size. Setting
    // colwidth to exactly the image's width left no room for the cell's
    // own padding, so the image rendered wider than the cell's padded
    // interior and visibly crossed the border into the next column. This
    // is added to every column-width value below to compensate.
    const cellEl = imgEl.closest("td, th");
    const cellExtra = (() => {
      if (!cellEl) return 0;
      const s = getComputedStyle(cellEl);
      return (
        parseFloat(s.paddingLeft || "0") +
        parseFloat(s.paddingRight || "0") +
        parseFloat(s.borderLeftWidth || "0") +
        parseFloat(s.borderRightWidth || "0")
      );
    })();

    // In sync with the image in BOTH directions now, not just growing past
    // the cell — shrinking the image shrinks its column too, live, exactly
    // like dragging the column's own purple resize line would.
    function onMove(ev: PointerEvent) {
      const w = clamp(startWidth + (ev.clientX - startX));
      imgEl.style.width = `${w}px`;
      if (ctx && tableEl && colgroupEl) {
        updateColumnsOnResize(ctx.tableNode, colgroupEl, tableEl, DEFAULT_CELL_MIN_WIDTH, ctx.colIndex, w + cellExtra);
      }
    }
    // pointercancel (button released outside the window/tab, alt-tab
    // mid-drag) never fires pointerup — without also listening for it, the
    // imgEl.style.maxWidth/maxHeight "none" overrides set above stay stuck
    // forever (nothing else resets them) and resizingRef.current never goes
    // back to false. Routed through the same handler rather than a separate
    // discard path — the width math (clamp(startWidth + dx)) is well-defined
    // at whatever position the cursor last reported, so there's no
    // "committing a bogus value" concern the way a table-move's target-cell
    // lookup would have.
    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      resizingRef.current = false;
      // The onMouseLeave guard suppressed hover-tracking for the whole
      // drag, so if the cursor ended up outside the wrapper, `hovered` is
      // still stuck true — reconcile it now that the drag is over rather
      // than leaving the resize handle/remove button visibly stranded.
      const stillInside = wrapperRef.current?.contains(document.elementFromPoint(ev.clientX, ev.clientY)) ?? false;
      if (!stillInside) setHovered(false);
      const next = clamp(startWidth + (ev.clientX - startX));
      if (ctx && typeof startPos === "number") {
        const currentNode = editor.state.doc.nodeAt(startPos);
        if (currentNode) {
          const tr = editor.state.tr;
          growColumnToFit(tr, ctx.tableNode, ctx.tableStart, ctx.colIndex, next + cellExtra);
          tr.setNodeMarkup(startPos, undefined, { ...currentNode.attrs, width: next });
          editor.view.dispatch(tr);
          return;
        }
      }
      updateAttributes({ width: next });
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }

  // data-image-key here (not just in renderHTML's serialized form below) is
  // what the update-history "jump to" feature queries for in the live DOM —
  // see RichTextEditor.tsx's scrollToAnchor. The remove button is offered
  // in every state (even while still loading, or if the signed URL fetch
  // failed) — a broken/stuck image should still be deletable without
  // needing to select the node and hit backspace.
  if (failed) {
    return (
      <NodeViewWrapper as="div" className="my-2" data-image-key={imageKey} contentEditable={false}>
        <div
          className="group relative flex h-32 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-xs text-neutral-400"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          Image unavailable
          {hovered && <RemoveButton onClick={() => deleteNode()} />}
        </div>
      </NodeViewWrapper>
    );
  }

  if (!url) {
    return (
      <NodeViewWrapper as="div" className="my-2" data-image-key={imageKey} contentEditable={false}>
        <div
          className="group relative flex h-32 items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-xs text-neutral-400"
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
        >
          Loading image…
          {hovered && <RemoveButton onClick={() => deleteNode()} />}
        </div>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as="div" className="my-2" data-image-key={imageKey} contentEditable={false}>
      <div
        ref={wrapperRef}
        // No max-w-full here (deliberately) — the <img> itself already
        // enforces the correct ceiling (max-w-full while unresized, or
        // startResize's own clamp() once it isn't — see its comment on
        // why that ceiling differs for a table cell vs. plain note text).
        // This div is just an inline-block wrapper for positioning the
        // remove button/resize handle, and being inline-block it already
        // shrinks to fit the image's own actual rendered box. A SEPARATE
        // max-w-full here could disagree with the image's own width once
        // resized, capping this wrapper's box smaller than the image
        // actually renders — which put the remove button/resize handle
        // (absolutely positioned against THIS div's corners) floating out
        // past the image's true edge instead of sitting on it.
        className="group relative inline-block"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          // Suppressed for the duration of a resize drag — see
          // resizingRef's own comment for why a hover-triggered re-render
          // mid-drag was fighting the direct DOM width write every frame.
          if (resizingRef.current) return;
          setHovered(false);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imgRef}
          src={url}
          alt=""
          style={{ width: width ? `${width}px` : undefined }}
          // max-w-full and max-h-96 only apply while unresized. Once a
          // width is explicitly set, the resize handle only ever controls
          // WIDTH — height is left to the browser's default "auto," which
          // scales it proportionally to preserve the image's own aspect
          // ratio. max-h-96 is a flat 384px cap completely unrelated to
          // that ratio: once a resized image's proportional height would
          // exceed it, the height got clipped to 384px while the width
          // stayed at whatever was dragged, rendering visibly squashed/
          // stretched instead of proportionally scaled. Same reasoning as
          // max-w-full's own conditional a few lines up — once the user
          // has explicitly sized the image, nothing should override that.
          className={`rounded-md border border-neutral-200 ${width ? "" : "max-h-96 max-w-full"}`}
          draggable={false}
        />
        {hovered && (
          <>
            <RemoveButton onClick={() => deleteNode()} />
            <div
              onPointerDown={startResize}
              role="presentation"
              aria-hidden
              title="Resize"
              className="absolute right-1 bottom-1 h-3 w-3 rounded-sm bg-neutral-300 transition-colors hover:bg-neutral-500"
              style={{ cursor: "nwse-resize", touchAction: "none" }}
            />
          </>
        )}
      </div>
    </NodeViewWrapper>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Remove image"
      className="absolute top-1.5 right-1.5 flex h-6 w-6 items-center justify-center rounded-md bg-white/90 text-neutral-500 shadow-sm hover:bg-white hover:text-red-600"
    >
      <Icon name="Interface/Trash_Empty" size={13} />
    </button>
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
      // Rendered as an inline style (not a bespoke data- attribute) so it
      // reuses the "style" allow-list entry the backend sanitizer already
      // grants for TableExtension.tsx's corner-resize width — no separate
      // backend change needed. Unset (null) falls back to the CSS
      // max-w-full default, same as before this attribute existed.
      width: {
        default: null,
        parseHTML: (el) => {
          const style = el.getAttribute("style");
          const match = style ? /\bwidth\s*:\s*([\d.]+)px/i.exec(style) : null;
          return match ? parseFloat(match[1]) : null;
        },
        renderHTML: (attrs) => (attrs.width ? { style: `width: ${attrs.width}px` } : {}),
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

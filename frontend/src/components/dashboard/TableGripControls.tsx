"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor } from "@tiptap/react";
import type { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { Transaction } from "@tiptap/pm/state";
import {
  CellSelection,
  TableMap,
  findTable,
  addColumn,
  addRow,
  removeColumn,
  removeRow,
  moveTableColumn,
  moveTableRow,
  columnResizingPluginKey,
} from "@tiptap/pm/tables";
import { Icon } from "@/components/dashboard/Icon";

interface TableRectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
  tableStart: number;
  map: TableMap;
  table: ProseMirrorNode;
}

function rectFor(map: TableMap, table: ProseMirrorNode, tableStart: number): TableRectLike {
  return { left: 0, right: map.width, top: 0, bottom: map.height, tableStart, map, table };
}

// Notion's own grip is a small dot-grid glyph that's invisible until you
// hover near that specific column/row — not a permanently-visible wall of
// buttons. ZONE is the (larger, invisible) hover target sized to the whole
// column/row; GRIP is just the small glyph centered inside it.
const ZONE_SIZE = 16;
const GRIP_GAP = 4; // px between a zone and the table's own edge
const DRAG_MOVE_THRESHOLD = 4; // px of pointer movement before a grip press counts as a drag, not a click

interface TableInfo {
  tableEl: HTMLTableElement;
  tablePos: number; // doc position directly before the table node — for setNodeMarkup, to change the table node's own attrs (e.g. width)
  tableStart: number; // doc position at the start of the table's content — add TableMap offsets to this, never use it as a position on its own
  cols: number;
  rows: number;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

// Rounds a rect to whole pixels by rounding its EDGES (top/left/right/
// bottom) rather than rounding left/width independently — two boxes that
// share a true edge (e.g. adjacent table cells sharing a border) round to
// the exact same pixel this way, since Math.round of the same input always
// agrees. Rounding left and width separately could round one box's right
// edge and the next box's left edge to different pixels even though both
// come from the same underlying coordinate, leaving a 1px gap or overlap —
// a likely contributor to the drag highlight band looking misaligned with
// the table's own cell borders, and to hit-testing flickering right at a
// column boundary.
function roundedBox(top: number, left: number, width: number, height: number): Box {
  const t = Math.round(top);
  const l = Math.round(left);
  return { top: t, left: l, width: Math.round(left + width) - l, height: Math.round(top + height) - t };
}

type MenuState = { kind: "col" | "row"; index: number; top: number; left: number } | null;
type DragState = { kind: "col" | "row"; index: number } | null;

interface Computed {
  info: TableInfo | null;
  tableBox: Box | null;
  colBoxes: Box[];
  rowBoxes: Box[];
  // Right edge of .tableWrapper's own visible box (not the table's, which
  // can render past it now that overflow-x handles anything wider than the
  // margin — see globals.css). Anchors elements that only make sense at the
  // table's TRUE right edge (the resize handle, the append-column button)
  // so they can hide themselves rather than float disconnected out in the
  // page's blank space whenever that edge is scrolled out of view.
  visibleRight: number | null;
}

const EMPTY_COMPUTED: Computed = { info: null, tableBox: null, colBoxes: [], rowBoxes: [], visibleRight: null };

// Table position + geometry, read straight from the live DOM — the grips
// need pixel positions, not just "which table/column/row," and this is the
// single place that reads the DOM for both. Whole-table-width persistence
// (fighting @tiptap/extension-table's own updateColumns() clearing it) is
// handled separately, on the "transaction" event — see the effect below —
// not in here, since this runs on every animation frame and stomping the
// DOM that often collided with the library's OWN live per-column-drag
// preview (which never dispatches a transaction until mouseup, only writes
// the DOM directly) — see that effect's comment for the full story.
function computeAll(editor: Editor): Computed {
  const { state } = editor.view;
  const found = findTable(state.selection.$from);
  if (!found) return EMPTY_COMPUTED;
  const dom = editor.view.nodeDOM(found.pos) as HTMLElement | null;
  const tableEl = dom?.querySelector("table") ?? null;
  if (!tableEl) return EMPTY_COMPUTED;

  const map = TableMap.get(found.node);
  const info: TableInfo = { tableEl, tablePos: found.pos, tableStart: found.start, cols: map.width, rows: map.height };

  const tRect = tableEl.getBoundingClientRect();
  const tableBox = roundedBox(tRect.top, tRect.left, tRect.width, tRect.height);
  const wrapperEl = tableEl.closest<HTMLElement>(".tableWrapper");
  const visibleRight = wrapperEl ? wrapperEl.getBoundingClientRect().right : null;

  const colBoxes: Box[] = [];
  const firstRow = tableEl.rows[0];
  if (firstRow) {
    for (let c = 0; c < firstRow.cells.length; c++) {
      const r = firstRow.cells[c].getBoundingClientRect();
      const { left, width } = roundedBox(tableBox.top, r.left, r.width, 0);
      colBoxes.push({ top: tableBox.top, left, width, height: 0 });
    }
  }

  const rowBoxes: Box[] = [];
  for (let i = 0; i < tableEl.rows.length; i++) {
    const r = tableEl.rows[i].getBoundingClientRect();
    const { top, height } = roundedBox(r.top, tableBox.left, 0, r.height);
    rowBoxes.push({ top, left: tableBox.left, width: 0, height });
  }

  return { info, tableBox, colBoxes, rowBoxes, visibleRight };
}

// Measures every table in the doc's current per-column pixel widths into
// `cache`, keyed by each table's own tablePos — see lastGoodColWidthsRef's
// declaration for why every table needs this, not just whichever one
// computeAll's own selection-scoped lookup happens to find.
function cacheAllTableWidths(editor: Editor, cache: Map<number, number[]>) {
  const { state } = editor.view;
  state.doc.descendants((node, pos) => {
    if (node.type.name !== "table") return true;
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    const tableEl = dom?.querySelector("table");
    const firstRow = tableEl?.rows[0];
    if (firstRow) {
      cache.set(pos, Array.from(firstRow.cells).map((c) => Math.round(c.getBoundingClientRect().width)));
    }
    return false; // no nested tables to descend into
  });
}

// A generous sanity bound only — NOT a margin ceiling. Earlier versions of
// this tried to compute a precise margin-respecting ceiling for the
// corner-drag handle (reading TableBreakout's own pane geometry, then a
// window.innerWidth-based backstop on top of that) across several rounds
// that still didn't reliably hold in practice. The margin is now enforced
// once, declaratively, in CSS instead: .tableWrapper's own max-width is
// simply 100% of its parent (the note's existing centered content column —
// see globals.css), the same boundary ordinary paragraph text already
// respects, with overflow-x: auto taking over via a scrollbar for anything
// wider — Obsidian's own model, and exactly what a corner-drag OR a wide/
// many column table both fall back on identically now. Nothing about width
// needs to be prevented from exceeding the column anymore; it just becomes
// scrollable, so this only needs to keep the drag itself from producing an
// absurd value.
const MIN_TABLE_WIDTH = 150;
const MAX_TABLE_WIDTH = 3000;

function sameStructure(a: TableInfo | null, b: TableInfo | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.tableEl === b.tableEl && a.cols === b.cols && a.rows === b.rows;
}

// Notion/Confluence-style table chrome: a small grip that fades in only on
// hover above each column / left of each row, which selects+highlights that
// column/row and opens an Insert/Delete menu on click, plus "+" buttons to
// append a row or column and drag-to-reorder on the grips themselves.
// Rendered as a fixed-position overlay portaled to <body> (same reasoning as
// IconPickerButton.tsx: escaping the note pane's own scroll-clipping
// ancestor).
//
// Positioning runs on a single always-on requestAnimationFrame loop rather
// than trying to enumerate every event that could move the table (editor
// transactions, window scroll/resize, a cell's image loading in
// asynchronously — all tried, all missed cases in practice, scrolling
// worst of all). The loop only touches React state when the table's
// *structure* changes (a different table, or a different row/column count)
// — that's what actually needs new DOM nodes. Pure position changes (every
// other frame) are written directly to the already-rendered nodes via refs,
// bypassing React entirely — going through setState+re-render 60 times a
// second is exactly what made the previous version visibly jittery.
export function TableGripControls({ editor }: { editor: Editor }) {
  // True for the duration of a startTableResize drag — see the width-heal
  // effect below for why it stands down while this is set.
  const resizingRef = useRef(false);
  const [computed, setComputed] = useState<Computed>(() => computeAll(editor));
  const { info, colBoxes, rowBoxes } = computed;
  const [menu, setMenu] = useState<MenuState>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  // Which column/row the grip should show for — driven by hovering the
  // TABLE's own cells (Notion's actual trigger), not just the small zone
  // the grip glyph itself sits in above/left of the table. See the
  // tableEl mousemove effect below.
  const [hoveredCol, setHoveredCol] = useState<number | null>(null);
  const [hoveredRow, setHoveredRow] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const structRef = useRef<TableInfo | null>(null);
  const latestComputedRef = useRef<Computed>(computed);
  // Per-column pixel widths for EVERY table in the doc (keyed by that
  // table's own tablePos), refreshed every RAF frame — see the RAF effect's
  // own comment for why the "transaction" effect needs THIS instead of a
  // live re-measurement when persisting widths before clearing a
  // corner-resize style. Covers every table, not just whichever one the
  // grips are currently showing for (i.e. wherever the ProseMirror
  // *selection* happens to be) — prosemirror-tables' own column-resize
  // handle is driven purely by mouse position, not by selection, so a user
  // can drag a column's border on a table their selection was never inside
  // in the first place.
  const lastGoodColWidthsRef = useRef<Map<number, number[]>>(new Map());
  // Set once a grip's pointer-drag actually crosses DRAG_MOVE_THRESHOLD —
  // consumed by that grip's onClick to skip select-and-open-menu when a
  // drag lands back on its own origin button. See startGripDrag.
  const suppressClickRef = useRef(false);

  const colZoneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rowZoneRefs = useRef<(HTMLDivElement | null)[]>([]);
  const colDropRefs = useRef<(HTMLDivElement | null)[]>([]);
  const rowDropRefs = useRef<(HTMLDivElement | null)[]>([]);
  const resizeHandleRef = useRef<HTMLDivElement>(null);

  // Re-derive the fresh table node/map from the editor's CURRENT state
  // rather than trusting anything captured in `info` — that's only ever a
  // snapshot for positioning the overlay, and every command below needs the
  // real, current document (info can be one transaction stale, e.g. right
  // after another row/column was just added).
  function withFreshTable(run: (ctx: { tr: Transaction; map: TableMap; table: ProseMirrorNode; tableStart: number }) => void) {
    if (!info) return;
    const { state } = editor.view;
    const size = state.doc.content.size;
    const probe = Math.min(info.tableStart + 1, Math.max(size - 1, 0));
    const $pos = state.doc.resolve(probe);
    const found = findTable($pos);
    if (!found) return;
    const map = TableMap.get(found.node);
    const tr = state.tr;
    run({ tr, map, table: found.node, tableStart: found.start });
    editor.view.dispatch(tr);
    editor.view.focus();
  }

  function applyPositions(next: Computed) {
    const { tableBox, colBoxes: cols, rowBoxes: rows, visibleRight } = next;
    if (!tableBox) return;
    cols.forEach((box, i) => {
      const el = colZoneRefs.current[i];
      if (!el) return;
      el.style.top = `${tableBox.top - ZONE_SIZE - GRIP_GAP}px`;
      el.style.left = `${box.left + box.width / 2 - ZONE_SIZE / 2}px`;
    });
    rows.forEach((box, i) => {
      const el = rowZoneRefs.current[i];
      if (!el) return;
      el.style.top = `${box.top + box.height / 2 - ZONE_SIZE / 2}px`;
      el.style.left = `${tableBox.left - ZONE_SIZE - GRIP_GAP}px`;
    });
    // Drag highlight bands, refreshed every frame like everything else here
    // — these used to be positioned straight from `computed` REACT STATE,
    // which is only refreshed on a STRUCTURAL change (see the RAF effect's
    // own comment for why). Any purely visual change to the table's
    // geometry that ISN'T a structural change — a corner-resize, a column
    // drag, a page scroll — left the band rendering at whatever size/
    // position it was the last time the structure happened to change,
    // completely disconnected from the table's actual current shape. That's
    // what produced a highlight band stretching far below the table into
    // blank page space, and made the very first switch during a drag look
    // like it "didn't happen" (the band was still catching up from a stale
    // size). Every other overlay element here already avoided this by being
    // ref-driven instead of state-driven; these just hadn't been.
    cols.forEach((box, i) => {
      const el = colDropRefs.current[i];
      if (!el) return;
      el.style.top = `${tableBox.top}px`;
      el.style.left = `${box.left}px`;
      el.style.width = `${box.width}px`;
      el.style.height = `${tableBox.height}px`;
    });
    rows.forEach((box, i) => {
      const el = rowDropRefs.current[i];
      if (!el) return;
      el.style.top = `${box.top}px`;
      el.style.left = `${tableBox.left}px`;
      el.style.width = `${tableBox.width}px`;
      el.style.height = `${box.height}px`;
    });
    // The table's TRUE right edge (tableBox.left + tableBox.width) can now
    // sit well past .tableWrapper's own visible box — a table wider than
    // the note's margin scrolls instead of being capped (see globals.css).
    // The corner resize handle, anchored to that true edge, has nowhere
    // sensible to render while that edge is scrolled out of view —
    // floating it out at its literal, off-screen coordinate just left a
    // disconnected control sitting in blank page space. Hidden instead
    // until scrolling brings the true edge back within the wrapper's own
    // visible box, at which point it resumes tracking it exactly.
    const tableRight = tableBox.left + tableBox.width;
    const edgeVisible = visibleRight === null || tableRight <= visibleRight + 0.5;
    if (resizeHandleRef.current) {
      resizeHandleRef.current.style.display = edgeVisible ? "" : "none";
      if (edgeVisible) {
        resizeHandleRef.current.style.top = `${tableBox.top + tableBox.height - 5}px`;
        resizeHandleRef.current.style.left = `${tableRight - 5}px`;
      }
    }
  }

  useEffect(() => {
    let raf = 0;
    function tick() {
      const next = computeAll(editor);
      latestComputedRef.current = next;
      // Cached every frame EXCEPT while a native column-resize drag is
      // actually in progress — this is what the "transaction" effect's
      // snapshot-and-persist step (see its own comment) uses instead of
      // re-measuring the DOM at that moment, since @tiptap/extension-
      // table's own updateColumns() has ALREADY synchronously collapsed the
      // table's rendered width by the time that listener runs. Scans every
      // table in the doc (see lastGoodColWidthsRef's own comment for why).
      //
      // The pause is the crucial part, added after that first version still
      // didn't hold up live: prosemirror-tables' OWN columnResizing plugin
      // runs a LIVE PREVIEW during the drag (displayColumnWidth, on every
      // native mousemove, well before any transaction) via its own
      // updateColumnsOnResize — a completely separate implementation from
      // @tiptap/extension-table's, with no concept of our custom `style`
      // attribute at all. That preview collapses the table to its natural
      // width immediately, on the very first pixel of movement, since not
      // every column has an explicit colwidth yet. Caching every frame
      // unconditionally meant this cache got continuously overwritten with
      // that already-collapsed preview state throughout the ENTIRE drag —
      // by the time mouseup committed, the "last known good" snapshot
      // wasn't good anymore, it was just whatever the collapsed preview
      // last looked like. Pausing here the moment a drag starts (detected
      // via prosemirror-tables' own exported columnResizingPluginKey) keeps
      // whatever was cached from BEFORE the drag intact for the whole
      // preview, right up until the real commit transaction needs it.
      const nativeColumnDragActive = !!columnResizingPluginKey.getState(editor.view.state)?.dragging;
      if (!nativeColumnDragActive) {
        cacheAllTableWidths(editor, lastGoodColWidthsRef.current);
      }
      if (!sameStructure(structRef.current, next.info)) {
        structRef.current = next.info;
        setComputed(next);
        // Refs for a just-changed structure don't exist yet this frame
        // (React hasn't committed); positioning resumes next tick once it
        // has, so there's nothing to write here.
      } else if (next.info) {
        applyPositions(next);
      }
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [editor]);

  // Whole-table-width persistence — for EVERY table in the doc, not just
  // whichever one currently has the grips (`info`, i.e. wherever the
  // ProseMirror *selection* happens to be). That used to be the scope, and
  // it broke as soon as the selection left the table: corner-resize a table,
  // then click a completely unrelated line elsewhere in the note, and the
  // table snapped back to its tiny natural size with nothing left tracking
  // it to catch that. Two things happen here, per table:
  //
  // 1. If a genuine per-column resize just landed on an EXISTING column
  //    (prosemirror-tables' own drag handle — distinct from
  //    startTableResize's corner handle below, which never touches colwidth
  //    at all), that's a more specific and more recent sizing decision than
  //    any earlier whole-table corner resize — so any stored corner-resize
  //    `style` width is cleared, letting the table's natural (now
  //    column-driven) width take over. Without this, a table that had EVER
  //    been corner-resized could never have its overall width reduced again
  //    by dragging a column back in: every subsequent transaction
  //    (including the column drag's own commit) re-triggered
  //    @tiptap/extension-table's updateColumns(), which cleared
  //    table.style.width, and step 2 below would then re-assert the stale,
  //    wider corner-resize value right back on top of it.
  //    Detected by comparing colwidths PER COLUMN, not just whether the
  //    combined signature changed — adding or removing a column changes the
  //    column count too, which isn't a width decision on any existing
  //    column and must NOT clear the corner-resize style: that was a real
  //    regression (appending a column right after a corner-resize snapped
  //    the table straight back down to its small natural width, since a
  //    resize wasn't what actually happened).
  // 2. Otherwise, if the table still has a stored corner-resize width and
  //    the DOM's own width was cleared by that same updateColumns() call
  //    (e.g. from some completely unrelated edit elsewhere in the note, OR
  //    from adding/removing a column, per the above), re-assert it.
  //
  // Runs once on mount (covers opening a note whose table was already
  // corner-resized, before any transaction has happened yet) and again on
  // every "transaction" thereafter — never per-frame, so this never runs
  // *during* a live per-column drag preview: prosemirror-tables' own
  // columnResizing plugin only writes the DOM directly while dragging
  // (displayColumnWidth) and doesn't dispatch a real transaction — and
  // therefore doesn't touch colwidth on the doc — until mouseup, so this
  // handler has nothing to react to (and nothing to fight) until then.
  const lastColWidthsByTableRef = useRef<Map<number, (number | null)[]>>(new Map());
  useEffect(() => {
    function colWidths(table: ProseMirrorNode): (number | null)[] {
      const firstRow = table.firstChild;
      if (!firstRow) return [];
      const widths: (number | null)[] = [];
      firstRow.forEach((cell) => {
        const cw = cell.attrs.colwidth as number[] | null | undefined;
        const colspan = cell.attrs.colspan as number;
        for (let i = 0; i < colspan; i++) {
          widths.push(cw ? (cw[i] ?? null) : null);
        }
      });
      return widths;
    }
    // Only true when the SAME set of columns exist in both and at least one
    // of them has a different width — a column being added/removed changes
    // .length, which this deliberately treats as "not a resize," not as
    // "everything changed."
    function existingColumnResized(prev: (number | null)[], next: (number | null)[]): boolean {
      if (prev.length !== next.length) return false;
      return prev.some((w, i) => w !== next[i]);
    }
    // Writes an explicit colwidth onto every column of `table`, from
    // `widthsByCol` (one pixel width per column index, 1:1 with the first
    // row's own DOM cells — the same simplifying assumption computeAll's
    // colBoxes already makes; this app has no way to create a merged/
    // colspan>1 cell, so it holds). Mirrors prosemirror-tables' own
    // (unexported) updateColumnWidth, just looped over every column instead
    // of one. See the caller below for why *every* column needs this, not
    // just whichever one the user actually dragged.
    function persistAllColumnWidths(tr: Transaction, table: ProseMirrorNode, tableStart: number, widthsByCol: number[]) {
      const map = TableMap.get(table);
      for (let col = 0; col < map.width; col++) {
        const width = widthsByCol[col];
        if (!width) continue;
        for (let row = 0; row < map.height; row++) {
          const mapIndex = row * map.width + col;
          if (row && map.map[mapIndex] === map.map[mapIndex - map.width]) continue;
          const pos = map.map[mapIndex];
          const cell = table.nodeAt(pos);
          if (!cell) continue;
          const index = cell.attrs.colspan === 1 ? 0 : col - map.colCount(pos);
          if (cell.attrs.colwidth && cell.attrs.colwidth[index] === width) continue;
          const colwidth = cell.attrs.colwidth ? (cell.attrs.colwidth as number[]).slice() : new Array(cell.attrs.colspan).fill(0);
          colwidth[index] = width;
          tr.setNodeMarkup(tableStart + pos, undefined, { ...cell.attrs, colwidth });
        }
      }
    }
    // Walks every table in the doc once, accumulating any needed fixes onto
    // a single shared transaction (rather than dispatching per table) —
    // dispatching mid-walk would invalidate the positions state.doc.
    // descendants is still iterating over.
    function reconcileAllTables() {
      if (resizingRef.current) return;
      const { state } = editor.view;
      // Always created eagerly (cheap — a Transaction with zero steps costs
      // nothing) rather than lazily assigned inside the descendants
      // callback below: a nullable `let` reassigned from within a nested
      // closure defeats TypeScript's control-flow narrowing at the
      // docChanged check further down. tr.docChanged alone (steps were
      // actually added or not) is what decides whether to dispatch.
      const tr = state.tr;
      const seen = new Set<number>();

      state.doc.descendants((node, pos) => {
        if (node.type.name !== "table") return true;
        seen.add(pos);

        const widths = colWidths(node);
        const prevWidths = lastColWidthsByTableRef.current.get(pos);
        const styleAttr = node.attrs.style as string | undefined;

        // prevWidths === undefined means this is the first time this table
        // has been seen (including the very first "reconcileAllTables()"
        // call on mount) — there's nothing to compare against yet, so the
        // existingColumnResized check below is skipped, but the reassert
        // at the bottom must NOT be skipped: @tiptap/extension-table's own
        // TableView constructor clears table.style.width synchronously on
        // a table's very first render the exact same way its update()
        // does on every later one (see this effect's own top comment) — a
        // note reopened with an already corner-resized table rendered it
        // at its small natural size on load, correcting only once some
        // later edit happened to trigger a second pass through here.
        if (prevWidths !== undefined && existingColumnResized(prevWidths, widths)) {
          if (styleAttr) {
            // See this effect's own comment (point 1) for why every OTHER
            // column's phantom-stretched width needs persisting here too,
            // not just cleared.
            //
            // Computed DETERMINISTICALLY from the corner-resize's own
            // stored total width, not from a DOM re-measurement (even the
            // RAF-cached "last known good" one) — `widths` here already
            // reflects the just-committed drag (the dragged column has a
            // real number, everything else is still null), so the fair
            // share for the remaining null columns is just "whatever's left
            // of the corner-resize's own total, split evenly." A DOM
            // snapshot depends on catching the right animation frame before
            // the browser's own reflow settles, which proved unreliable in
            // practice (still saw a case where the persisted widths didn't
            // match what was on screen) — this has no such dependency, it's
            // pure arithmetic on values we already have.
            const totalMatch = /\bwidth\s*:\s*([\d.]+)px/i.exec(styleAttr);
            const total = totalMatch ? parseFloat(totalMatch[1]) : null;
            let widthsByCol: number[];
            if (total && total > 0) {
              const explicitSum = widths.reduce((sum: number, w) => sum + (w ?? 0), 0);
              const unsetCount = widths.filter((w) => w == null).length;
              const remaining = Math.max(0, total - explicitSum);
              const fairShare = unsetCount > 0 ? Math.max(40, Math.floor(remaining / unsetCount)) : 0;
              widthsByCol = widths.map((w) => w ?? fairShare);
            } else {
              widthsByCol = lastGoodColWidthsRef.current.get(pos) ?? [];
            }
            persistAllColumnWidths(tr, node, pos + 1, widthsByCol);
            tr.setNodeMarkup(pos, undefined, { ...node.attrs, style: null });
            lastColWidthsByTableRef.current.set(pos, widthsByCol);
          } else {
            lastColWidthsByTableRef.current.set(pos, widths);
          }
          return false;
        }
        lastColWidthsByTableRef.current.set(pos, widths);

        if (styleAttr) {
          const widthMatch = /\bwidth\s*:\s*([\d.]+px)/i.exec(styleAttr);
          if (widthMatch) {
            const tableEl = (editor.view.nodeDOM(pos) as HTMLElement | null)?.querySelector("table");
            if (tableEl && tableEl.style.width !== widthMatch[1]) {
              tableEl.style.width = widthMatch[1];
            }
          }
        }
        return false;
      });

      // Forget tables that no longer exist (deleted) so a future table
      // reusing a similar position doesn't inherit stale tracking.
      for (const key of Array.from(lastColWidthsByTableRef.current.keys())) {
        if (!seen.has(key)) lastColWidthsByTableRef.current.delete(key);
      }

      // Dispatching re-enters this same function synchronously (it's also
      // the "transaction" listener) — safe: the tables just fixed now have
      // lastColWidthsByTableRef already pointing at their new, real widths,
      // so the re-entrant pass sees no further change and does nothing for
      // them, only for whatever else might still need it.
      if (tr.docChanged) {
        editor.view.dispatch(tr);
      }
    }
    reconcileAllTables();
    editor.on("transaction", reconcileAllTables);
    return () => {
      editor.off("transaction", reconcileAllTables);
    };
  }, [editor]);

  useEffect(() => {
    if (!menu) return;
    function onMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenu(null);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [menu]);

  // Notion's grip appears while hovering the column/row's own cells, not
  // just the small strip the glyph itself occupies above/left of the table
  // — that's what made it feel undiscoverable (had to already know to
  // mouse *outside* the table). Reads colBoxes/rowBoxes from the RAF loop's
  // latest measurement (latestComputedRef) instead of re-measuring the DOM
  // on every mousemove, and only calls setState when the hovered index
  // actually changes, not on every pixel of movement.
  const tableEl = info?.tableEl;
  useEffect(() => {
    if (!tableEl) return;
    function onMove(e: MouseEvent) {
      const { colBoxes: cols, rowBoxes: rows } = latestComputedRef.current;
      const col = cols.findIndex((b) => e.clientX >= b.left && e.clientX <= b.left + b.width);
      const row = rows.findIndex((b) => e.clientY >= b.top && e.clientY <= b.top + b.height);
      setHoveredCol(col === -1 ? null : col);
      setHoveredRow(row === -1 ? null : row);
    }
    function onLeave() {
      setHoveredCol(null);
      setHoveredRow(null);
    }
    tableEl.addEventListener("mousemove", onMove);
    tableEl.addEventListener("mouseleave", onLeave);
    return () => {
      tableEl.removeEventListener("mousemove", onMove);
      tableEl.removeEventListener("mouseleave", onLeave);
    };
  }, [tableEl]);

  // Position freshly-rendered zones immediately after a structural change,
  // rather than waiting up to one more animation frame for the loop above
  // to catch up — avoids a one-frame flash at (0,0) for new nodes.
  useEffect(() => {
    applyPositions(computed);
  }, [computed]);

  if (!info) return null;

  function selectColumn(index: number) {
    withFreshTable(({ tr, map, table, tableStart }) => {
      const $anchor = tr.doc.resolve(tableStart + map.positionAt(0, index, table));
      const $head = tr.doc.resolve(tableStart + map.positionAt(map.height - 1, index, table));
      tr.setSelection(CellSelection.colSelection($anchor, $head));
    });
  }

  function selectRow(index: number) {
    withFreshTable(({ tr, map, table, tableStart }) => {
      const $anchor = tr.doc.resolve(tableStart + map.positionAt(index, 0, table));
      const $head = tr.doc.resolve(tableStart + map.positionAt(index, map.width - 1, table));
      tr.setSelection(CellSelection.rowSelection($anchor, $head));
    });
  }

  function insertColumn(at: number) {
    withFreshTable(({ tr, map, table, tableStart }) => addColumn(tr, rectFor(map, table, tableStart), at));
    setMenu(null);
  }

  function insertRow(at: number) {
    withFreshTable(({ tr, map, table, tableStart }) => addRow(tr, rectFor(map, table, tableStart), at));
    setMenu(null);
  }

  function removeColumnAt(index: number) {
    // Last column — delete the whole table rather than leaving a
    // zero-column husk (removeColumn itself allows going to zero columns,
    // which just renders as an invisible, unrecoverable-by-UI table).
    if ((info?.cols ?? 0) <= 1) {
      editor.chain().focus().deleteTable().run();
    } else {
      withFreshTable(({ tr, map, table, tableStart }) => removeColumn(tr, rectFor(map, table, tableStart), index));
    }
    setMenu(null);
  }

  function removeRowAt(index: number) {
    if ((info?.rows ?? 0) <= 1) {
      editor.chain().focus().deleteTable().run();
    } else {
      withFreshTable(({ tr, map, table, tableStart }) => removeRow(tr, rectFor(map, table, tableStart), index));
    }
    setMenu(null);
  }

  // Reordering via the grips used to be native HTML5 drag-and-drop
  // (draggable/onDragStart/onDragOver/onDrop) — replaced with raw pointer
  // events for the same reason startTableResize below already uses them:
  // browsers throttle/pause requestAnimationFrame for the duration of an
  // active NATIVE drag session, and dragover only fires at a coarse rate
  // compared to pointermove, both of which read as "jittery" since nothing
  // here — the highlighted target band, the grips lighting up — could keep
  // up with the cursor smoothly. Plain pointermove/pointerup have neither
  // problem; this table's own corner-resize handle already proved that out.
  //
  // A small movement threshold distinguishes an actual drag from a plain
  // click (which still needs to fall through to the button's own onClick,
  // for select-column-and-open-menu) — DRAG_MOVE_THRESHOLD below.
  // suppressClickRef additionally guards the case where a drag crosses the
  // threshold and then wiggles back onto its own origin button before
  // release, which would otherwise still fire a click there.
  function targetIndexAt(kind: "col" | "row", ev: PointerEvent): number | null {
    const { colBoxes: cols, rowBoxes: rows } = latestComputedRef.current;
    if (kind === "col") {
      const i = cols.findIndex((b) => ev.clientX >= b.left && ev.clientX <= b.left + b.width);
      return i === -1 ? null : i;
    }
    const i = rows.findIndex((b) => ev.clientY >= b.top && ev.clientY <= b.top + b.height);
    return i === -1 ? null : i;
  }

  function startGripDrag(kind: "col" | "row", index: number, e: React.PointerEvent) {
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    let dragging = false;
    function onMove(ev: PointerEvent) {
      if (!dragging) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_MOVE_THRESHOLD) return;
        dragging = true;
        suppressClickRef.current = true;
        setDrag({ kind, index });
        setDragOver(index);
      }
      const t = targetIndexAt(kind, ev);
      if (t !== null) setDragOver(t);
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!dragging) return; // plain click — let the button's own onClick run
      const target = targetIndexAt(kind, ev);
      if (target !== null && target !== index) {
        const move = kind === "col" ? moveTableColumn : moveTableRow;
        move({ from: index, to: target })(editor.view.state, editor.view.dispatch);
        editor.view.focus();
      }
      setDrag(null);
      setDragOver(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  // Whole-table resize (not a per-column drag — that's the separate
  // built-in handle from TableKit's own `resizable: true`). Applies the
  // width directly to the table DOM element on every pointer move for
  // immediate visual feedback rather than dispatching a transaction per
  // pixel, then commits it as an inline `style="width:…"` on the table
  // node's own attrs once on release — see TableExtension.tsx for why it
  // has to be a `style` attr specifically.
  function startTableResize(e: React.PointerEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!info) return;
    const tableEl = info.tableEl;
    const startX = e.clientX;
    const startWidth = tableEl.getBoundingClientRect().width;
    function clamp(w: number) {
      return Math.round(Math.min(MAX_TABLE_WIDTH, Math.max(MIN_TABLE_WIDTH, w)));
    }
    // Suspended for the drag's duration — see computeAll's width-heal
    // comment. Re-armed on release regardless of how the drag ends.
    resizingRef.current = true;
    function onMove(ev: PointerEvent) {
      tableEl.style.width = `${clamp(startWidth + (ev.clientX - startX))}px`;
    }
    function onUp(ev: PointerEvent) {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const next = clamp(startWidth + (ev.clientX - startX));
      const { state } = editor.view;
      const node = info ? state.doc.nodeAt(info.tablePos) : null;
      resizingRef.current = false;
      if (!node) return;
      const tr = state.tr.setNodeMarkup(info!.tablePos, undefined, { ...node.attrs, style: `width: ${next}px` });
      editor.view.dispatch(tr);
      editor.view.focus();
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  return createPortal(
    <>
      {colBoxes.map((_, i) => (
        <div
          key={`col-${i}`}
          ref={(el) => {
            colZoneRefs.current[i] = el;
          }}
          onMouseEnter={() => setHoveredCol(i)}
          onMouseLeave={() => setHoveredCol((v) => (v === i ? null : v))}
          className="z-40"
          style={{ position: "fixed", width: ZONE_SIZE, height: ZONE_SIZE }}
        >
          <button
            type="button"
            onPointerDown={(e) => startGripDrag("col", i, e)}
            onClick={(e) => {
              e.stopPropagation();
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              selectColumn(i);
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ kind: "col", index: i, top: r.bottom + 4, left: r.left });
            }}
            title={`Column ${i + 1}`}
            className={`flex h-full w-full items-center justify-center rounded text-neutral-500 transition-opacity hover:bg-neutral-200 ${
              // Every column's grip lights up for the duration of a column
              // drag (not just the one under the cursor) — otherwise a
              // valid drop target could be invisible the whole time. See
              // the highlighted band below for the actual (much larger)
              // drop target this now sits on top of.
              hoveredCol === i || drag?.kind === "col" || (menu?.kind === "col" && menu.index === i)
                ? "opacity-100"
                : "opacity-0"
            }`}
            style={{
              background: dragOver === i && drag?.kind === "col" ? "var(--brand-purple-tint)" : undefined,
              color: dragOver === i && drag?.kind === "col" ? "var(--brand-purple)" : undefined,
              cursor: drag?.kind === "col" ? "grabbing" : "grab",
              touchAction: "none",
            }}
          >
            <Icon name="Interface/Drag_Horizontal" size={11} />
          </button>
        </div>
      ))}

      {rowBoxes.map((_, i) => (
        <div
          key={`row-${i}`}
          ref={(el) => {
            rowZoneRefs.current[i] = el;
          }}
          onMouseEnter={() => setHoveredRow(i)}
          onMouseLeave={() => setHoveredRow((v) => (v === i ? null : v))}
          className="z-40"
          style={{ position: "fixed", width: ZONE_SIZE, height: ZONE_SIZE }}
        >
          <button
            type="button"
            onPointerDown={(e) => startGripDrag("row", i, e)}
            onClick={(e) => {
              e.stopPropagation();
              if (suppressClickRef.current) {
                suppressClickRef.current = false;
                return;
              }
              selectRow(i);
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ kind: "row", index: i, top: r.top, left: r.right + 4 });
            }}
            title={`Row ${i + 1}`}
            className={`flex h-full w-full items-center justify-center rounded text-neutral-500 transition-opacity hover:bg-neutral-200 ${
              hoveredRow === i || drag?.kind === "row" || (menu?.kind === "row" && menu.index === i)
                ? "opacity-100"
                : "opacity-0"
            }`}
            style={{
              background: dragOver === i && drag?.kind === "row" ? "var(--brand-purple-tint)" : undefined,
              color: dragOver === i && drag?.kind === "row" ? "var(--brand-purple)" : undefined,
              cursor: drag?.kind === "row" ? "grabbing" : "grab",
              touchAction: "none",
            }}
          >
            <Icon name="Interface/Drag_Vertical" size={11} />
          </button>
        </div>
      ))}

      {/* Wide drag-over targets — the full column/row band, not just the
          16px grip glyph. Only mounted while a same-kind drag is active, so
          they never intercept normal clicks/text-selection inside the
          table the rest of the time. Purely visual — pointer-events: none,
          since startGripDrag above determines the target itself (from
          latestComputedRef, against the live pointer position) rather than
          relying on these being the actual thing the cursor is over.
          top/left/width/height are deliberately NOT set here — they're
          written directly to the ref every frame by applyPositions, same as
          every other overlay element, not derived from `computed` React
          state (see applyPositions' own comment for why that went stale). */}
      {drag?.kind === "col" &&
        colBoxes.map((_, i) => (
          <div
            key={`col-drop-${i}`}
            ref={(el) => {
              colDropRefs.current[i] = el;
            }}
            // Deliberately no transition-colors here — dragOver flips
            // rapidly (many times a second) while actively dragging across
            // columns, and animating each band's fade in/out meant several
            // were visibly mid-fade at once, overlapping into a smeared,
            // "sloppy" look instead of one crisp highlight snapping cleanly
            // from column to column.
            className="z-30 rounded-sm"
            style={{
              position: "fixed",
              pointerEvents: "none",
              background: dragOver === i ? "var(--brand-purple-tint)" : "transparent",
              opacity: dragOver === i ? 0.5 : 0,
            }}
          />
        ))}
      {drag?.kind === "row" &&
        rowBoxes.map((_, i) => (
          <div
            key={`row-drop-${i}`}
            ref={(el) => {
              rowDropRefs.current[i] = el;
            }}
            className="z-30 rounded-sm"
            style={{
              position: "fixed",
              pointerEvents: "none",
              background: dragOver === i ? "var(--brand-purple-tint)" : "transparent",
              opacity: dragOver === i ? 0.5 : 0,
            }}
          />
        ))}

      {/* Whole-table resize — bottom-right corner. Distinct from the
          per-column drag handles TableKit's own `resizable: true` already
          draws along column borders inside the table. Adding a column/row
          at the far edge is done via a grip's own "Insert right"/"Insert
          below" menu item instead of a separate always-present "+" button —
          removed as redundant now that every grip already covers it. */}
      <div
        ref={resizeHandleRef}
        onPointerDown={startTableResize}
        role="presentation"
        aria-hidden
        className="z-40 rounded-sm bg-neutral-300 transition-colors hover:bg-neutral-500"
        style={{ position: "fixed", width: 10, height: 10, cursor: "nwse-resize" }}
      />

      {menu && (
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          className="z-50 w-40 rounded-md border border-neutral-200 bg-white py-1 shadow-lg"
          style={{ position: "fixed", top: menu.top, left: menu.left, fontFamily: "var(--font-ui)" }}
        >
          <MenuItem
            icon={menu.kind === "col" ? "Arrow/Chevron_Left" : "Arrow/Chevron_Up"}
            label={menu.kind === "col" ? "Insert left" : "Insert above"}
            onClick={() => (menu.kind === "col" ? insertColumn(menu.index) : insertRow(menu.index))}
          />
          <MenuItem
            icon={menu.kind === "col" ? "Arrow/Chevron_Right" : "Arrow/Chevron_Down"}
            label={menu.kind === "col" ? "Insert right" : "Insert below"}
            onClick={() => (menu.kind === "col" ? insertColumn(menu.index + 1) : insertRow(menu.index + 1))}
          />
          <div className="my-1 border-t border-neutral-100" />
          <MenuItem
            icon="Interface/Trash_Empty"
            label={menu.kind === "col" ? "Delete column" : "Delete row"}
            danger
            onClick={() => (menu.kind === "col" ? removeColumnAt(menu.index) : removeRowAt(menu.index))}
          />
        </div>
      )}
    </>,
    document.body,
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-neutral-50 ${
        danger ? "text-red-600" : "text-neutral-700"
      }`}
    >
      <Icon name={icon} size={13} />
      {label}
    </button>
  );
}

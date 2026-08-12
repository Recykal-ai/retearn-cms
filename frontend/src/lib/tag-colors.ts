// Categorical palette — the dataviz skill's validated reference order
// (references/palette.md): passes lightness-band, chroma-floor, and CVD
// adjacent-pair checks (`node scripts/validate_palette.js`) in this exact
// order, which is itself the CVD-safety mechanism, not cosmetic — don't
// reorder without re-validating. Backgrounds are each hue mixed 14% into
// white, matching the existing soft-pill treatment used elsewhere in the app.
const PALETTE: { bg: string; fg: string }[] = [
  { bg: "#e1ecf9", fg: "#2a78d6" }, // blue
  { bg: "#fceae3", fg: "#eb6834" }, // orange
  { bg: "#dff4ec", fg: "#1baf7a" }, // aqua
  { bg: "#fcf2db", fg: "#eda100" }, // yellow
  { bg: "#fcedf2", fg: "#e87ba4" }, // magenta
  { bg: "#dbeedb", fg: "#008300" }, // green
  { bg: "#e6e3f3", fg: "#4a3aa7" }, // violet
  { bg: "#fbe6e5", fg: "#e34948" }, // red
];

// Team/product tags are structural (which team/product a doc belongs to),
// so they stay one fixed color each rather than rotating through the
// categorical palette.
export const TEAM_TAG_COLOR = { bg: "#eef1f5", fg: "#3d4a5c" };
export const PRODUCT_TAG_COLOR = { bg: "#f3eef7", fg: "#6b4e85" };

// Category tags are colored per their owning team/product — a Category's
// `scope` field is literally the owning team/product's id, so every category
// under "AI" shares one color, every category under "Embedded" shares a
// different one, etc. Same entity, same color.
//
// This hash is a FALLBACK only, for the handful of call sites that don't
// (yet) have the full team/product list to build a proper scopeColors map
// (see buildScopeColorMap below, which is what should be used everywhere
// that can) — independent per-id hashing into a small fixed palette can't
// guarantee two real teams land on different slots (confirmed: with this
// app's real team/product ids, "AI" and "SDE" hashed to the identical slot
// no matter which of several palette sizes were tried, since the pair just
// happens to collide under simple modular hashing — not fixable by
// tweaking the palette size). buildScopeColorMap sidesteps that entirely by
// assigning slots from a sorted, deduped list instead of hashing each id in
// isolation, which is what actually guarantees no two DIFFERENT known
// scopes share a slot as long as there are palette.length of them or fewer.
export function colorForScope(scopeId: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < scopeId.length; i++) {
    hash = (hash * 31 + scopeId.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

// The robust version of colorForScope — call this wherever the full set of
// team/product ids is already available (a server component that fetched
// teams+products, or a modal that already has them as props) and thread the
// resulting map down to colorForCategory. Sorting (not fetch/creation order)
// keeps the assignment stable across requests/renders regardless of what
// order teams/products happened to come back in.
export function buildScopeColorMap(scopeIds: string[]): Record<string, { bg: string; fg: string }> {
  const sorted = [...new Set(scopeIds)].sort();
  const map: Record<string, { bg: string; fg: string }> = {};
  sorted.forEach((id, i) => {
    map[id] = PALETTE[i % PALETTE.length];
  });
  return map;
}

// A global category (Category.isGlobal — created once across every team and
// product at once, see backend's POST /api/categories scope:"all") gets one
// fixed, reserved gold color instead of a PALETTE slot — a saturated hue no
// PALETTE entry produces, so it's instantly recognizable as "spans
// everything" rather than looking like it belongs to one particular scope.
export const GLOBAL_TAG_COLOR = { bg: "#fdedb8", fg: "#8a6100" };

export function colorForCategory(
  c: { scope: string; isGlobal?: boolean },
  scopeColors?: Record<string, { bg: string; fg: string }>,
): { bg: string; fg: string } {
  if (c.isGlobal) return GLOBAL_TAG_COLOR;
  return scopeColors?.[c.scope] ?? colorForScope(c.scope);
}

// A global category is one conceptual tag even though it's stored as one row
// per team/product (see Category.isGlobal in the schema) — a document or
// picker that ends up holding two of its rows (e.g. tagged under both its
// team's and a product's copy of "Goa DRS") should only ever show one chip
// for it. Non-global categories never collapse, even if same-named — those
// are genuinely separate tags that happen to share a name.
export function dedupeGlobalCategories<T extends { name: string; isGlobal?: boolean }>(categories: T[]): T[] {
  const seenGlobalNames = new Set<string>();
  const result: T[] = [];
  for (const c of categories) {
    if (c.isGlobal) {
      if (seenGlobalNames.has(c.name)) continue;
      seenGlobalNames.add(c.name);
    }
    result.push(c);
  }
  return result;
}

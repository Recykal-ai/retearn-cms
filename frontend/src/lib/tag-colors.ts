// Categorical palette (validated for CVD-safe adjacent contrast), tinted down
// to soft pill backgrounds with a darker foreground of the same hue —
// matching the status-pill treatment already used elsewhere in the app.
const PALETTE: { bg: string; fg: string }[] = [
  { bg: "#e8f1fc", fg: "#1c5cab" }, // blue
  { bg: "#e6f7f0", fg: "#0f7a52" }, // aqua
  { bg: "#fdf3e2", fg: "#9a6a12" }, // yellow
  { bg: "#e8f3e8", fg: "#1f5c1f" }, // green
  { bg: "#ece9fa", fg: "#4a3aa7" }, // violet
  { bg: "#fbe9e9", fg: "#b3342c" }, // red
  { bg: "#fceef3", fg: "#b13d6c" }, // magenta
  { bg: "#fdece4", fg: "#b8471f" }, // orange
];

// Team/product tags are structural (which team/product a doc belongs to),
// so they stay one fixed color each rather than rotating through the
// categorical palette.
export const TEAM_TAG_COLOR = { bg: "#eef1f5", fg: "#3d4a5c" };
export const PRODUCT_TAG_COLOR = { bg: "#f3eef7", fg: "#6b4e85" };

// Category tags are colored per their owning team/product instead — a
// Category's `scope` field is literally the owning team/product's id, so
// every category under "AI" shares one color, every category under
// "Embedded" shares a different one, etc. Same entity, same color.
export function colorForScope(scopeId: string): { bg: string; fg: string } {
  let hash = 0;
  for (let i = 0; i < scopeId.length; i++) {
    hash = (hash * 31 + scopeId.charCodeAt(i)) | 0;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}

// A global category (Category.isGlobal — created once across every team and
// product at once, see backend's POST /api/categories scope:"all") gets one
// fixed, reserved gold color instead of the per-scope hash — a saturated
// hue no PALETTE entry produces, so it's instantly recognizable as "spans
// everything" rather than looking like it belongs to one particular scope.
export const GLOBAL_TAG_COLOR = { bg: "#fdedb8", fg: "#8a6100" };

export function colorForCategory(c: { scope: string; isGlobal?: boolean }): { bg: string; fg: string } {
  return c.isGlobal ? GLOBAL_TAG_COLOR : colorForScope(c.scope);
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

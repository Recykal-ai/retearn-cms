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

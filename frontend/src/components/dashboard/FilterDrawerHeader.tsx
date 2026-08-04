// Shared by FilterPanel.tsx, PinnedPageContent.tsx, and RecycleBinList.tsx.
// "Clear all" is purple/underlined (an action link, matching AppliedFilters'
// existing "Clear all" treatment) — deliberately a different color from the
// neutral-gray × close button, since same-color text/icon side by side read
// as one washed-out block rather than two distinct controls. The × sits in
// a fixed-size box so its vertical center lines up with "Clear all"'s text
// regardless of the glyph's own font metrics.
export function FilterDrawerHeader({
  onClose,
  onClear,
  showClear,
}: {
  onClose: () => void;
  onClear: () => void;
  showClear: boolean;
}) {
  return (
    <div className="flex items-center justify-between border-b border-neutral-100 px-5 py-4">
      <h2 className="text-base font-semibold text-neutral-900">Filters</h2>
      <div className="flex items-center gap-3">
        {showClear && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-medium underline"
            style={{ color: "var(--brand-purple)" }}
          >
            Clear all
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-6 w-6 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
        >
          <span className="text-lg leading-none">×</span>
        </button>
      </div>
    </div>
  );
}

import { Icon } from "@/components/dashboard/Icon";

// Icon-only filter trigger shared by FilterPanel.tsx, PinnedPageContent.tsx,
// and RecycleBinList.tsx — replaces the old "Filter (N)" text button.
export function FilterTriggerButton({ activeCount, onClick }: { activeCount: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Filters${activeCount > 0 ? ` (${activeCount} active)` : ""}`}
      className="relative flex shrink-0 items-center justify-center rounded-md border p-1.5 transition-colors"
      style={
        activeCount > 0
          ? { borderColor: "var(--brand-purple)", color: "var(--brand-purple)", background: "var(--brand-purple-tint)" }
          : { borderColor: "#e5e5e5", color: "#525252" }
      }
    >
      <Icon name="Interface/Filter" size={15} style={{ color: "currentColor" }} />
      {activeCount > 0 && (
        <span
          className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white"
          style={{ background: "var(--brand-purple)" }}
        >
          {activeCount}
        </span>
      )}
    </button>
  );
}

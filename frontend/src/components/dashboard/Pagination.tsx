import { Icon } from "@/components/dashboard/Icon";

// Shared by DocumentsTable.tsx, ApprovalsAdmin.tsx, and DeletionRequestsAdmin.tsx.
export function Pagination({
  page,
  pageCount,
  onChange,
}: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-center gap-1 border-t border-neutral-100 py-3 dark:border-neutral-800">
      <button
        type="button"
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-neutral-800"
      >
        <Icon name="Arrow/Chevron_Left" size={14} style={{ color: "var(--brand-purple)" }} />
      </button>
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-current={n === page ? "page" : undefined}
          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors ${n === page ? "" : "text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"}`}
          style={n === page ? { background: "var(--brand-purple)", color: "white" } : undefined}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page === pageCount}
        aria-label="Next page"
        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-neutral-100 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-neutral-800"
      >
        <Icon name="Arrow/Chevron_Right" size={14} style={{ color: "var(--brand-purple)" }} />
      </button>
    </div>
  );
}

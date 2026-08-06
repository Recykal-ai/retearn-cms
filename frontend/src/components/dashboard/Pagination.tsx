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
        className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:hover:bg-transparent dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
      >
        Prev
      </button>
      {Array.from({ length: pageCount }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-current={n === page ? "page" : undefined}
          className={`min-w-7 rounded-md px-2 py-1 text-xs font-medium transition-colors ${n === page ? "" : "text-neutral-600 dark:text-neutral-400"}`}
          style={n === page ? { background: "var(--brand-purple)", color: "white" } : undefined}
        >
          {n}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onChange(page + 1)}
        disabled={page === pageCount}
        className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-40 disabled:hover:bg-transparent dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
      >
        Next
      </button>
    </div>
  );
}

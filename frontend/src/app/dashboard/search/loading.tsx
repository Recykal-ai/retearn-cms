export default function SearchLoading() {
  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--canvas)" }}>
      <div className="h-14 flex-shrink-0 border-b border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-4xl rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          <div className="border-b border-neutral-100 px-6 py-4 dark:border-neutral-800">
            <div className="h-6 w-40 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
          </div>
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminLoading() {
  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--canvas)" }}>
      <div
        className="h-15 flex-shrink-0"
        style={{ background: "linear-gradient(180deg, var(--header-gradient-start) 0%, var(--header-gradient-end) 100%)" }}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-56 flex-shrink-0 border-r border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800" />
            ))}
          </div>
        </div>
        <main className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-5xl space-y-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
                  <div className="mb-3 h-5 w-24 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
                  <div className="flex flex-wrap gap-1.5">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <div key={j} className="h-6 w-16 animate-pulse rounded-full bg-neutral-100 dark:bg-neutral-800" />
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-700 dark:bg-neutral-900">
              <div className="mb-4 h-5 w-40 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
              <div className="h-8 w-64 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800" />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

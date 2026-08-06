export default function DashboardLoading() {
  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--canvas)" }}>
      <div className="h-14 flex-shrink-0 border-b border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
      <div className="h-11 flex-shrink-0 border-b border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
      <div className="flex flex-1 overflow-hidden">
        <div className="w-16 flex-shrink-0 border-r border-neutral-100 bg-white dark:border-neutral-800 dark:bg-neutral-900" />
        <div className="w-64 flex-shrink-0 border-r border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-4 h-9 animate-pulse rounded-full bg-neutral-100 dark:bg-neutral-800" />
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-8 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800" />
            ))}
          </div>
        </div>
        <main className="flex-1 overflow-hidden p-6">
          <div className="flex h-full flex-col rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 dark:border-neutral-800">
              <div className="h-6 w-32 animate-pulse rounded bg-neutral-100 dark:bg-neutral-800" />
              <div className="h-7 w-16 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800" />
            </div>
            <div className="space-y-3 p-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-neutral-100 dark:bg-neutral-800" />
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

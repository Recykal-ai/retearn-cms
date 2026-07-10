export default function PinnedLoading() {
  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--canvas)" }}>
      <div
        className="h-15 flex-shrink-0"
        style={{ background: "linear-gradient(180deg, var(--brand-purple) 0%, var(--brand-purple-dark) 100%)" }}
      />
      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-5xl rounded-lg border border-neutral-200 bg-white p-6 shadow-sm">
          <div className="mb-5 h-6 w-32 animate-pulse rounded bg-neutral-100" />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-lg bg-neutral-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

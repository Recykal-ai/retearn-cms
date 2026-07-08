export default function ApprovalsLoading() {
  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--canvas)" }}>
      <div
        className="h-15 flex-shrink-0"
        style={{ background: "linear-gradient(180deg, var(--brand-purple) 0%, var(--brand-purple-dark) 100%)" }}
      />
      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-4xl rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 px-6 py-4">
            <div className="h-6 w-28 animate-pulse rounded bg-neutral-100" />
          </div>
          <div className="space-y-3 p-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-md bg-neutral-100" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

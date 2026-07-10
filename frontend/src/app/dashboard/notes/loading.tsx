export default function NotesLoading() {
  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--canvas)" }}>
      <div
        className="h-15 flex-shrink-0"
        style={{ background: "linear-gradient(180deg, var(--brand-purple) 0%, var(--brand-purple-dark) 100%)" }}
      />
      <div className="flex min-h-0 flex-1">
        <div className="w-80 shrink-0 border-r border-neutral-100 bg-white p-4">
          <div className="mb-4 h-8 w-40 animate-pulse rounded-full bg-neutral-100" />
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-neutral-100" />
            ))}
          </div>
        </div>
        <div className="flex-1 bg-white" />
      </div>
    </div>
  );
}

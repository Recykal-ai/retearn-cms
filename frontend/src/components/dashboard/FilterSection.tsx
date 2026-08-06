// Shared by FilterPanel.tsx, PinnedPageContent.tsx, and RecycleBinList.tsx —
// previously an identical copy-pasted helper in all three.
export function FilterSection({ title, children, last }: { title: string; children: React.ReactNode; last?: boolean }) {
  return (
    <div className={last ? "" : "mb-5 border-b border-neutral-100 pb-5 dark:border-neutral-800"}>
      <p className="mb-2 text-xs font-semibold text-neutral-600 dark:text-neutral-400">{title}</p>
      {children}
    </div>
  );
}

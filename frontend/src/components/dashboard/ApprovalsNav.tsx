import Link from "next/link";

export type ApprovalsTab = "approvals" | "deletions";

export function ApprovalsNav({
  activeTab,
  pendingCount,
  deletionCount,
}: {
  activeTab: ApprovalsTab;
  pendingCount: number;
  deletionCount: number;
}) {
  return (
    <nav
      className="w-56 flex-shrink-0 overflow-y-auto border-r border-neutral-200 bg-white px-3 py-5"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      <div className="space-y-0.5">
        <NavItem href="/dashboard/approvals?tab=approvals" active={activeTab === "approvals"} count={pendingCount}>
          Approval requests
        </NavItem>
        <NavItem href="/dashboard/approvals?tab=deletions" active={activeTab === "deletions"} count={deletionCount}>
          Deletion requests
        </NavItem>
      </div>
    </nav>
  );
}

function NavItem({
  href,
  active,
  count,
  children,
}: {
  href: string;
  active: boolean;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm font-medium transition-colors"
      style={active ? { background: "var(--brand-purple-tint)", color: "var(--brand-purple)" } : { color: "#525252" }}
    >
      {children}
      {count > 0 && (
        <span
          className="flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
          style={{ background: "#b3342c" }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

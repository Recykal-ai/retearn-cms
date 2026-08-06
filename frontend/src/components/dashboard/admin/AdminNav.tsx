import Link from "next/link";

export type AdminTab = "categories" | "access" | "audit";

export function AdminNav({
  activeTab,
  isSuperAdmin,
}: {
  activeTab: AdminTab;
  isSuperAdmin: boolean;
}) {
  return (
    <nav
      className="w-56 flex-shrink-0 overflow-y-auto border-r border-neutral-200 bg-white px-3 py-5 dark:border-neutral-700 dark:bg-neutral-900"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      <div className="space-y-0.5">
        <NavItem href="/dashboard/admin?tab=categories" active={activeTab === "categories"}>
          Category creation
        </NavItem>
        {isSuperAdmin && (
          <NavItem href="/dashboard/admin?tab=access" active={activeTab === "access"}>
            Access
          </NavItem>
        )}
        <NavItem href="/dashboard/admin?tab=audit" active={activeTab === "audit"}>
          Audit Log
        </NavItem>
      </div>
    </nav>
  );
}

function NavItem({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={`block rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${active ? "" : "text-neutral-600 dark:text-neutral-400"}`}
      style={active ? { background: "var(--brand-purple-tint)", color: "var(--brand-purple)" } : undefined}
    >
      {children}
    </Link>
  );
}

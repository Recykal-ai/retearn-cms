import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getTeams, getProducts, getCategories, getGlobalCategories, getUsers, getAuditLog, getMe, type Category } from "@/lib/api";
import { withSessionGuard } from "@/lib/session-guard";
import { AdminNav, type AdminTab } from "@/components/dashboard/admin/AdminNav";
import { EntityPanel } from "@/components/dashboard/admin/EntityPanel";
import { CategoriesSection } from "@/components/dashboard/admin/CategoriesSection";
import { GlobalCategoriesSection } from "@/components/dashboard/admin/GlobalCategoriesSection";
import { UsersSection } from "@/components/dashboard/admin/UsersSection";
import { AuditLogSection } from "@/components/dashboard/admin/AuditLogSection";
import { SubPageTopBar } from "@/components/dashboard/SubPageTopBar";
import { createTeamAction, createProductAction, deleteTeamAction, deleteProductAction } from "@/app/dashboard/admin/admin-actions";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/");
  }
  if (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }
  if (!session.appToken) {
    redirect("/");
  }

  const appToken = session.appToken;
  const isSuperAdmin = session.role === "SUPER_ADMIN";
  const { tab } = await searchParams;
  const activeTab: AdminTab = tab === "access" && isSuperAdmin ? "access" : tab === "audit" ? "audit" : "categories";

  const { teams, products, categoriesByScope, globalCategories, users, auditLog, viewerScope } = await withSessionGuard(
    async () => {
      const [teams, products, me] = await Promise.all([getTeams(appToken), getProducts(appToken), getMe(appToken)]);

      const allEntities = [...teams, ...products];
      const categoryLists = await Promise.all(allEntities.map((e) => getCategories(appToken, e.id)));
      const categoriesByScope: Record<string, Category[]> = {};
      allEntities.forEach((e, i) => {
        categoriesByScope[e.id] = categoryLists[i];
      });

      const [users, auditLog, globalCategories] = await Promise.all([
        isSuperAdmin ? getUsers(appToken) : Promise.resolve([]),
        getAuditLog(appToken, 50),
        getGlobalCategories(appToken),
      ]);

      return { teams, products, categoriesByScope, globalCategories, users, auditLog, viewerScope: me.adminScope };
    },
  );

  return (
    <div className="flex h-screen flex-col" style={{ fontFamily: "var(--font-ui)", background: "var(--canvas)" }}>
      <SubPageTopBar />

      <div className="flex flex-1 overflow-hidden">
        <AdminNav activeTab={activeTab} isSuperAdmin={isSuperAdmin} />

        <main className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-5xl space-y-6">
            {activeTab === "categories" && (
              <>
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <EntityPanel
                    title="Teams"
                    items={teams}
                    action={createTeamAction}
                    onDelete={deleteTeamAction}
                    placeholder="e.g. Growth"
                    canCreate={viewerScope === null}
                  />
                  <EntityPanel
                    title="Products"
                    items={products}
                    action={createProductAction}
                    onDelete={deleteProductAction}
                    placeholder="e.g. Fastscan"
                    canCreate={viewerScope === null}
                  />
                </div>
                <GlobalCategoriesSection categories={globalCategories} isSuperAdmin={isSuperAdmin} />
                <CategoriesSection
                  teams={teams}
                  products={products}
                  categoriesByScope={categoriesByScope}
                  viewerScope={viewerScope}
                  isSuperAdmin={isSuperAdmin}
                />
              </>
            )}

            {activeTab === "access" && isSuperAdmin && <UsersSection users={users} teams={teams} products={products} />}

            {activeTab === "audit" && <AuditLogSection entries={auditLog} />}
          </div>
        </main>
      </div>
    </div>
  );
}

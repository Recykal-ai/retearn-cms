import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getTeams,
  getProducts,
  getCategories,
  getDocuments,
  type Category,
  type DocStatus,
  type SortField,
  type SortDir,
} from "@/lib/api";
import { withSessionGuard } from "@/lib/session-guard";
import { fileTypeOf } from "@/lib/file-type";
import { TopBar } from "@/components/dashboard/TopBar";
import { ActionBar } from "@/components/dashboard/ActionBar";
import { SideRail } from "@/components/dashboard/SideRail";
import { NavSidebar } from "@/components/dashboard/NavSidebar";
import { DocumentsPanel } from "@/components/dashboard/DocumentsPanel";
import type { ViewMode } from "@/components/dashboard/ViewSwitcher";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    mode?: string;
    entity?: string;
    category?: string;
    status?: string;
    modifiedSince?: string;
    sort?: string;
    dir?: string;
    type?: string;
    view?: string;
  }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/");
  }
  if (!session.appToken) {
    redirect("/");
  }

  const { mode: modeParam, entity, category, status, modifiedSince, sort, dir, type, view } = await searchParams;
  const mode: "team" | "product" = modeParam === "product" ? "product" : "team";
  const viewMode: ViewMode = view === "tabs" ? "tabs" : view === "folders" ? "folders" : "list";
  const appToken = session.appToken;
  const isAdmin = session.role === "ADMIN" || session.role === "SUPER_ADMIN";

  const { teams, products, categoriesByScope, categories, documents, selected, categoryCounts } =
    await withSessionGuard(async () => {
      const [teams, products] = await Promise.all([getTeams(appToken), getProducts(appToken)]);

      const allEntities = [...teams, ...products];
      const categoryLists = await Promise.all(allEntities.map((e) => getCategories(appToken, e.id)));
      const categoriesByScope: Record<string, Category[]> = {};
      allEntities.forEach((e, i) => {
        categoriesByScope[e.id] = categoryLists[i];
      });

      const entities = mode === "team" ? teams : products;
      const selected = (entity ? entities.find((e) => e.id === entity) : undefined) ?? entities[0];
      const categories = selected ? (categoriesByScope[selected.id] ?? []) : [];

      const [allDocuments, entityDocuments] = await Promise.all([
        selected
          ? getDocuments(appToken, {
              mode,
              entityId: selected.id,
              category,
              status: status as DocStatus | undefined,
              modifiedSince,
              sort: sort as SortField | undefined,
              dir: dir as SortDir | undefined,
            })
          : Promise.resolve([]),
        // Unfiltered (entity-scoped only) fetch, used to compute the Filter
        // panel's "N docs" count per tag regardless of which filters are active.
        selected ? getDocuments(appToken, { mode, entityId: selected.id }) : Promise.resolve([]),
      ]);

      // File-type filtering has no matching backend column (it's derived from
      // the filename extension), so it's applied here rather than as a query param.
      // `type` can be a comma-separated list (the Filter panel's Type section is multi-select).
      const selectedTypes = type ? type.split(",").filter(Boolean) : [];
      const documents = selectedTypes.length
        ? allDocuments.filter((d) => selectedTypes.includes(fileTypeOf(d.title, d.sourceType)))
        : allDocuments;

      const categoryCounts: Record<string, number> = {};
      for (const d of entityDocuments) {
        for (const c of d.categories) {
          categoryCounts[c.id] = (categoryCounts[c.id] ?? 0) + 1;
        }
      }

      return { teams, products, categoriesByScope, categories, documents, selected, categoryCounts };
    });

  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--canvas)" }}>
      <TopBar />
      <ActionBar teams={teams} products={products} categoriesByScope={categoriesByScope} isAdmin={isAdmin} />
      <div className="flex flex-1 overflow-hidden">
        <SideRail
          userName={session.user?.name ?? ""}
          userEmail={session.user?.email ?? ""}
          isAdmin={isAdmin}
        />
        <NavSidebar mode={mode} teams={teams} products={products} selectedId={selected?.id} />
        <main className="flex-1 overflow-hidden p-6">
          <DocumentsPanel
            mode={mode}
            entityId={selected?.id}
            entityName={selected?.name}
            categories={categories}
            selectedCategoryId={category}
            status={status}
            modifiedSince={modifiedSince}
            type={type}
            sort={sort as SortField | undefined}
            dir={dir as SortDir | undefined}
            view={viewMode}
            documents={documents}
            categoryCounts={categoryCounts}
            isAdmin={isAdmin}
            currentUserId={session.appUserId}
          />
        </main>
      </div>
    </div>
  );
}

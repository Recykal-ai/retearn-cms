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
  // No mode param at all (a bare "/dashboard" landing) resolves to "all" —
  // the home view shows every team's and product's documents together,
  // rather than defaulting into whichever team happens to be first.
  const mode: "team" | "product" | "all" =
    modeParam === "product" ? "product" : modeParam === "team" ? "team" : "all";
  // Folder view is the default landing view everywhere on the dashboard —
  // list/tabs are still one click away via the ViewSwitcher, but a bare URL
  // (or one that never set ?view=) now lands on folders instead of list.
  const viewMode: ViewMode = view === "tabs" ? "tabs" : view === "list" ? "list" : "folders";
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

      const entities = mode === "team" ? teams : mode === "product" ? products : [];
      // No fallback to entities[0] — picking the "Team" or "Product" toggle
      // switches which list the sidebar shows, but doesn't itself narrow the
      // document list to any one entity. Only clicking a specific team/
      // product row does that; until then this stays undefined and every
      // document (global) keeps showing, same as bare "all" mode.
      const selected = entity ? entities.find((e) => e.id === entity) : undefined;
      const isGlobal = !selected;

      // A Category is scoped to exactly one team or product in the schema
      // (see CLAUDE.md §2/§8 — @@unique([name, scope])), so "Goa DRS" under
      // Team AI and "Goa DRS" under Product Ace are genuinely two different
      // rows. The home view treats same-named categories across scopes as
      // one filterable concept (that's the whole point of a global view —
      // finding "Goa DRS" docs without picking a team first), using the
      // display name itself as a synthetic id since it's guaranteed distinct
      // from any real category UUID. categoryNameToIds keeps the mapping
      // back to the real, scope-specific ids the actual documents query
      // needs (the API only ever filters by real category id).
      const allCategoriesFlat = Object.values(categoriesByScope).flat();
      const categoryNameToIds = new Map<string, string[]>();
      const categoryNameIsGlobal = new Map<string, boolean>();
      for (const c of allCategoriesFlat) {
        const ids = categoryNameToIds.get(c.name) ?? [];
        ids.push(c.id);
        categoryNameToIds.set(c.name, ids);
        // Only true when every real row sharing this name was created by the
        // "create under every team/product" flow — a name that coincidentally
        // collides with an unrelated, manually-created category elsewhere
        // shouldn't be painted with the reserved global color.
        categoryNameIsGlobal.set(c.name, (categoryNameIsGlobal.get(c.name) ?? true) && c.isGlobal);
      }
      const allModeCategories: Category[] = [...categoryNameToIds.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ id: name, name, scope: "all", documentCount: 0, isGlobal: categoryNameIsGlobal.get(name) ?? false }));

      const categories = isGlobal ? allModeCategories : categoriesByScope[selected!.id] ?? [];

      const resolvedCategoryParam = isGlobal
        ? (category ? category.split(",").filter(Boolean) : []).flatMap((name) => categoryNameToIds.get(name) ?? []).join(",") ||
          undefined
        : category;

      // entities is only ever non-empty for mode "team"/"product" (see
      // above), so selected — and therefore !isGlobal — can only be truthy
      // when mode is one of those two; TS just can't see that relationship
      // across the two independently-computed values.
      const entityMode = mode as "team" | "product";

      const [allDocuments, entityDocuments] = await Promise.all([
        isGlobal
          ? getDocuments(appToken, {
              category: resolvedCategoryParam,
              status: status as DocStatus | undefined,
              modifiedSince,
              sort: sort as SortField | undefined,
              dir: dir as SortDir | undefined,
            })
          : getDocuments(appToken, {
              mode: entityMode,
              entityId: selected!.id,
              category,
              status: status as DocStatus | undefined,
              modifiedSince,
              sort: sort as SortField | undefined,
              dir: dir as SortDir | undefined,
            }),
        // Unfiltered fetch, used to compute the Filter panel's "N docs" count
        // per tag regardless of which filters are active.
        isGlobal ? getDocuments(appToken, {}) : getDocuments(appToken, { mode: entityMode, entityId: selected!.id }),
      ]);

      // File-type filtering has no matching backend column (it's derived from
      // the filename extension), so it's applied here rather than as a query param.
      // `type` can be a comma-separated list (the Filter panel's Type section is multi-select).
      const selectedTypes = type ? type.split(",").filter(Boolean) : [];
      const documents = selectedTypes.length
        ? allDocuments.filter((d) => selectedTypes.includes(fileTypeOf(d.title, d.sourceType)))
        : allDocuments;

      const categoryCounts: Record<string, number> = {};
      if (isGlobal) {
        // Keyed by name (the same synthetic id space allModeCategories
        // uses) — a document counts once per distinct category name even if
        // it happens to carry same-named categories from two different
        // scopes (e.g. tagged under both Team AI's and Product Ace's "Goa DRS").
        for (const d of entityDocuments) {
          const seenNames = new Set<string>();
          for (const c of d.categories) {
            if (seenNames.has(c.name)) continue;
            seenNames.add(c.name);
            categoryCounts[c.name] = (categoryCounts[c.name] ?? 0) + 1;
          }
        }
      } else {
        for (const d of entityDocuments) {
          for (const c of d.categories) {
            categoryCounts[c.id] = (categoryCounts[c.id] ?? 0) + 1;
          }
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

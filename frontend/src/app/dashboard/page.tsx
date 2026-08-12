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
    uploadedBy?: string;
    sort?: string;
    dir?: string;
    type?: string;
    pinned?: string;
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

  const { mode: modeParam, entity, category, status, modifiedSince, uploadedBy, sort, dir, type, pinned, view } = await searchParams;
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

  const {
    teams,
    products,
    categoriesByScope,
    categories,
    documents,
    selected,
    categoryCounts,
    uploaders,
    categoryGroups,
    categorySuperGroups,
  } = await withSessionGuard(async () => {
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
      // product row does that.
      const selected = entity ? entities.find((e) => e.id === entity) : undefined;
      // `isGlobal` (categories are synthetic/name-merged, not real scoped
      // ids — see below) is true whenever no single entity is picked yet,
      // covering BOTH bare "all" mode and the Team/Product toggle with no
      // row clicked. `isFullyGlobal` narrows that to just true "all" —
      // the two used to be conflated into one flag, which is what let the
      // Team/Product toggle (mode set, no entity) silently fall through to
      // the exact same unrestricted "show every document" behavior as bare
      // "all": clicking "Product" showed team-only-tagged docs and their
      // categories (e.g. a "Backend"/"Software" folder with zero products
      // tagged) right alongside actual product docs, with nothing narrowing
      // the list to "has at least one product tag" the way clicking a
      // specific product already correctly did.
      const isGlobal = !selected;
      const isFullyGlobal = mode === "all";

      // A Category is scoped to exactly one team or product in the schema
      // (see CLAUDE.md §2/§8 — @@unique([name, scope])), so "Goa DRS" under
      // Team AI and "Goa DRS" under Product Ace are genuinely two different
      // rows. Both the true-global view and the Team/Product-toggle-only
      // view treat same-named categories across their own scope as one
      // filterable concept (finding "Goa DRS" docs without picking a team
      // first) — mergeCategories below builds that name-merged list from
      // whichever entity set is relevant (every team+product for "all",
      // just teams or just products for the toggle-only view), using the
      // display name itself as a synthetic id since it's guaranteed
      // distinct from any real category UUID. Its returned nameToIds keeps
      // the mapping back to the real, scope-specific ids the actual
      // documents query needs (the API only ever filters by real category id).
      function mergeCategories(scopeEntities: { id: string }[]) {
        const nameToIds = new Map<string, string[]>();
        const nameIsGlobal = new Map<string, boolean>();
        for (const e of scopeEntities) {
          for (const c of categoriesByScope[e.id] ?? []) {
            const ids = nameToIds.get(c.name) ?? [];
            ids.push(c.id);
            nameToIds.set(c.name, ids);
            // Only true when every real row sharing this name was created by
            // the "create under every team/product" flow — a name that
            // coincidentally collides with an unrelated, manually-created
            // category elsewhere shouldn't be painted with the reserved
            // global color.
            nameIsGlobal.set(c.name, (nameIsGlobal.get(c.name) ?? true) && c.isGlobal);
          }
        }
        // Global tags first (matching the per-scope GET /api/categories
        // order), alphabetical within each group.
        const merged: Category[] = [...nameToIds.keys()]
          .sort((a, b) => {
            const globalDiff = Number(nameIsGlobal.get(b) ?? false) - Number(nameIsGlobal.get(a) ?? false);
            return globalDiff !== 0 ? globalDiff : a.localeCompare(b);
          })
          .map((name) => ({ id: name, name, scope: "all", documentCount: 0, isGlobal: nameIsGlobal.get(name) ?? false }));
        return { nameToIds, nameIsGlobal, merged };
      }

      const allEntitiesMerge = mergeCategories(allEntities);
      const allModeCategories = allEntitiesMerge.merged;
      // Same merge, but scoped to just this mode's own entities (teams or
      // products) — what the Team/Product toggle with no entity picked
      // actually needs, so e.g. Product mode never shows a team-only
      // category as one of its folders.
      const modeEntitiesMerge = mergeCategories(entities);
      const modeCategories = modeEntitiesMerge.merged;

      const categories = isFullyGlobal
        ? allModeCategories
        : isGlobal
          ? modeCategories
          : categoriesByScope[selected!.id] ?? [];

      const activeNameToIds = isFullyGlobal ? allEntitiesMerge.nameToIds : modeEntitiesMerge.nameToIds;
      const resolvedCategoryParam = isGlobal
        ? (category ? category.split(",").filter(Boolean) : []).flatMap((name) => activeNameToIds.get(name) ?? []).join(",") ||
          undefined
        : category;

      // entities is only ever non-empty for mode "team"/"product" (see
      // above), so selected — and therefore !isGlobal — can only be truthy
      // when mode is one of those two; TS just can't see that relationship
      // across the two independently-computed values.
      const entityMode = mode as "team" | "product";

      const [allDocuments, entityDocuments] = await Promise.all([
        isFullyGlobal
          ? getDocuments(appToken, {
              category: resolvedCategoryParam,
              status: status as DocStatus | undefined,
              modifiedSince,
              uploadedBy,
              sort: sort as SortField | undefined,
              dir: dir as SortDir | undefined,
              mergeRecent: true,
            })
          : getDocuments(appToken, {
              mode: entityMode,
              entityId: selected?.id,
              category: isGlobal ? resolvedCategoryParam : category,
              status: status as DocStatus | undefined,
              modifiedSince,
              uploadedBy,
              sort: sort as SortField | undefined,
              dir: dir as SortDir | undefined,
              mergeRecent: true,
            }),
        // Unfiltered fetch, used to compute the Filter panel's "N docs" count
        // per tag/uploader regardless of which filters are active.
        isFullyGlobal ? getDocuments(appToken, {}) : getDocuments(appToken, { mode: entityMode, entityId: selected?.id }),
      ]);

      // File-type filtering has no matching backend column (it's derived from
      // the filename extension), so it's applied here rather than as a query param.
      // `type` can be a comma-separated list (the Filter panel's Type section is multi-select).
      const selectedTypes = type ? type.split(",").filter(Boolean) : [];
      // Same reasoning for "pinned only" — every document already carries its
      // own `pinned` flag (serializeDocument annotates it from the current
      // user's PinnedDocument rows), so there's no need for a backend query
      // param just to re-derive something already sitting on the object.
      // This is what lets "pinned only" work inside whatever team/product/
      // category folder you're already browsing, instead of only existing
      // as the separate, folder-less /dashboard/pinned page.
      const pinnedOnly = pinned === "true";
      const documents = allDocuments
        .filter((d) => !selectedTypes.length || selectedTypes.includes(fileTypeOf(d.title, d.sourceType)))
        .filter((d) => !pinnedOnly || d.pinned);

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

      const uploaderCounts = new Map<string, { id: string; name: string; email: string; count: number }>();
      for (const d of entityDocuments) {
        const existing = uploaderCounts.get(d.uploadedBy.id);
        if (existing) existing.count += 1;
        else uploaderCounts.set(d.uploadedBy.id, { id: d.uploadedBy.id, name: d.uploadedBy.name, email: d.uploadedBy.email, count: 1 });
      }
      const uploaders = Array.from(uploaderCounts.values()).sort((a, b) => a.name.localeCompare(b.name));

      // Tag grouping (by owning Team/Product) only makes sense once
      // `categories` itself is the synthetic/merged kind — a single
      // selected entity's `categories` is already scoped to just that one
      // team/product being browsed. Each entity's group includes ALL of
      // its categories, global ones included — a product whose tags happen
      // to be entirely global (a real case: see e.g. "Goa DRS", bulk-created
      // across every team/product) still needs to show up as its own group,
      // not vanish because none of its tags were non-global. "Global tags"
      // stays a flat entry (pinned first); Team/Product entities each nest
      // under their own "Team"/"Product" super-section — except in the
      // Team/Product-toggle-only view (mode set, no entity), which only
      // ever offers ITS OWN mode's entities as groups (no "Product"
      // super-section while browsing Team mode, and vice versa), matching
      // the same mode-scoping the document list and folder categories now get.
      const groupsCategoryPool = isFullyGlobal ? allModeCategories : modeCategories;
      const globalGroup =
        isGlobal && groupsCategoryPool.some((c) => c.isGlobal)
          ? [{ key: "__global__", label: "Global tags", categories: groupsCategoryPool.filter((c) => c.isGlobal) }]
          : [];
      const groupFor = (e: { id: string; name: string }) => {
        const names = new Set((categoriesByScope[e.id] ?? []).map((c) => c.name));
        return { key: e.id, label: e.name, categories: groupsCategoryPool.filter((c) => names.has(c.name)) };
      };
      // undefined (not an empty array) in single-entity mode — FilterPanel
      // uses "was this prop passed at all" to decide grouped vs. flat Tags
      // rendering, and an empty array is truthy in JS, so passing `[]` here
      // unconditionally would've silently selected grouped rendering (and
      // shown nothing) even outside "all"/toggle-only mode.
      if (!isGlobal) {
        return {
          teams,
          products,
          categoriesByScope,
          categories,
          documents,
          selected,
          categoryCounts,
          uploaders,
          categoryGroups: undefined,
          categorySuperGroups: undefined,
        };
      }
      const teamGroups = isFullyGlobal || mode === "team" ? teams.map(groupFor).filter((g) => g.categories.length > 0) : [];
      const productGroups = isFullyGlobal || mode === "product" ? products.map(groupFor).filter((g) => g.categories.length > 0) : [];
      const categoryGroups = globalGroup;
      const categorySuperGroups = [
        ...(teamGroups.length ? [{ key: "__teams__", label: "Team", groups: teamGroups }] : []),
        ...(productGroups.length ? [{ key: "__products__", label: "Product", groups: productGroups }] : []),
      ];

      return {
        teams,
        products,
        categoriesByScope,
        categories,
        documents,
        selected,
        categoryCounts,
        uploaders,
        categoryGroups,
        categorySuperGroups,
      };
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
            uploadedBy={uploadedBy}
            type={type}
            pinned={pinned}
            sort={sort as SortField | undefined}
            dir={dir as SortDir | undefined}
            view={viewMode}
            documents={documents}
            categoryCounts={categoryCounts}
            uploaders={uploaders}
            categoryGroups={categoryGroups}
            categorySuperGroups={categorySuperGroups}
            isAdmin={isAdmin}
            currentUserId={session.appUserId}
          />
        </main>
      </div>
    </div>
  );
}

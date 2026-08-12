import type { Category, DocumentSummary, SortField, SortDir } from "@/lib/api";
import { FilterPanel } from "@/components/dashboard/FilterPanel";
import { AppliedFilters } from "@/components/dashboard/AppliedFilters";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { DocumentsTable } from "@/components/dashboard/DocumentsTable";
import { DocumentsCardGrid } from "@/components/dashboard/DocumentsCardGrid";
import { FolderGrid } from "@/components/dashboard/FolderGrid";
import { ViewSwitcher, type ViewMode } from "@/components/dashboard/ViewSwitcher";
import type { UploaderOption } from "@/components/dashboard/UploaderFilterSection";
import type { TagGroup, TagSuperGroup } from "@/components/dashboard/GroupedTagSection";

export function DocumentsPanel({
  mode,
  entityId,
  entityName,
  categories,
  selectedCategoryId,
  status,
  modifiedSince,
  uploadedBy,
  type,
  pinned,
  sort,
  dir,
  view,
  documents,
  categoryCounts,
  uploaders,
  scopeColors,
  categoryGroups,
  categorySuperGroups,
  isAdmin,
  currentUserId,
}: {
  mode: "team" | "product" | "all";
  entityId?: string;
  entityName?: string;
  categories: Category[];
  selectedCategoryId?: string;
  status?: string;
  modifiedSince?: string;
  uploadedBy?: string;
  type?: string;
  pinned?: string;
  sort?: SortField;
  dir?: SortDir;
  view: ViewMode;
  documents: DocumentSummary[];
  categoryCounts?: Record<string, number>;
  uploaders?: UploaderOption[];
  // Every team/product's assigned color, built once from the FULL list (see
  // buildScopeColorMap in tag-colors.ts) — passed down instead of having
  // FolderGrid/DocumentsTable/FilterPanel each hash a bare scope id
  // independently, which is what let two different teams collide onto the
  // same color (confirmed: "AI" and "SDE" hashed identically).
  scopeColors?: Record<string, { bg: string; fg: string }>;
  categoryGroups?: TagGroup[];
  categorySuperGroups?: TagSuperGroup[];
  isAdmin?: boolean;
  currentUserId?: string;
}) {
  // mode is always "all" whenever entityId is undefined (page.tsx only ever
  // omits entityId in all-mode), so this always has a "?" already — every
  // href built below by appending "&..." onto entityHref stays well-formed
  // instead of producing a bare "/dashboard&..." for the no-entity case.
  const entityHref = entityId ? `/dashboard?mode=${mode}&entity=${entityId}` : `/dashboard?mode=${mode}`;
  const categoryHref = selectedCategoryId ? `${entityHref}&category=${selectedCategoryId}` : entityHref;

  // Sort headers only render in list view (see the render branch below), but
  // the href still needs view=list explicit — folders is the default when
  // the param's omitted (see dashboard/page.tsx), so leaving it off here
  // would silently bounce a list-view sort click over to folder view.
  function sortHref(field: SortField, sortDir: SortDir) {
    return `${categoryHref}&sort=${field}&dir=${sortDir}&view=${view}`;
  }
  const nameAscHref = sortHref("name", "asc");
  const nameDescHref = sortHref("name", "desc");
  const modifiedAscHref = sortHref("modified", "asc");
  const modifiedDescHref = sortHref("modified", "desc");

  const isFolderView = view === "folders";
  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId)
    : undefined;
  // In folder view, going "up" a level (or into a folder tile — FolderGrid
  // builds its own links from this) means dropping the category but keeping
  // the folder view itself. Must still carry status/modifiedSince/type
  // explicitly — otherwise navigating into or out of a folder silently
  // dropped whatever filters were active (e.g. a Pending-status filter
  // showing "1 document" in a folder tile, then landing on all documents
  // once you actually opened it).
  const folderUpHref = (() => {
    const url = new URL(`${entityHref}&view=folders`, "http://placeholder");
    if (status) url.searchParams.set("status", status);
    if (modifiedSince) url.searchParams.set("modifiedSince", modifiedSince);
    if (uploadedBy) url.searchParams.set("uploadedBy", uploadedBy);
    if (type) url.searchParams.set("type", type);
    if (pinned) url.searchParams.set("pinned", pinned);
    return `${url.pathname}${url.search}`;
  })();

  // The current location with no removable filters (status/date/type) — used
  // wherever an action should preserve view mode/folder without carrying over
  // one-off filters (the Filter panel's own base, and the breadcrumb root).
  // Always carries the current view explicitly — folders is the default when
  // the param's absent, so omitting it for list/tabs would silently bounce
  // back to folders instead of staying put.
  const identityHref = `${categoryHref}&view=${view}`;

  // The full current URL, filters included — AppliedFilters needs this so
  // removing one chip out of a multi-select (e.g. one Type among several)
  // correctly preserves the others instead of wiping the whole filter.
  const fullCurrentHref = (() => {
    const url = new URL(identityHref, "http://placeholder");
    if (status) url.searchParams.set("status", status);
    if (modifiedSince) url.searchParams.set("modifiedSince", modifiedSince);
    if (uploadedBy) url.searchParams.set("uploadedBy", uploadedBy);
    if (type) url.searchParams.set("type", type);
    if (pinned) url.searchParams.set("pinned", pinned);
    return `${url.pathname}${url.search}`;
  })();

  // Where "Clear all" actually goes — identityHref isn't filter-free on its
  // own: categoryHref (which it's built from) bakes the selected category
  // back in, so router-pushing straight to identityHref left category
  // filters surviving a "Clear all" click. In folder view category isn't a
  // removable filter at all (it's the folder you're standing in — see
  // filterCategoryId below), so identityHref is fine as-is there; only list
  // view needs category explicitly stripped too.
  const clearAllHref = isFolderView ? identityHref : `${entityHref}&view=${view}`;

  // "Documents" always returns to the true global home (bare "/dashboard" —
  // no mode, no entity, no filters), regardless of which team/product or
  // filters are currently active — that's what makes it act like a "go
  // home" breadcrumb rather than just resetting filters within whatever's
  // currently selected. Inert (no href) only when already exactly there, so
  // it doesn't look clickable for no reason.
  const isAtGlobalHome =
    mode === "all" &&
    !selectedCategoryId &&
    !status &&
    !modifiedSince &&
    !uploadedBy &&
    !type &&
    !pinned &&
    !sort &&
    !dir &&
    view === "folders";
  const documentsCrumbHref = isAtGlobalHome ? undefined : "/dashboard";

  // The page title itself now tracks wherever you actually are — a selected
  // category/tag first (e.g. "Goa DRS", clicked as a global chip right on
  // the "all" home view, per CategoriesSection's "All" tag option — mode
  // stays "all" the whole time, only selectedCategoryId changes, so mode
  // alone isn't enough to decide this), then whichever team/product is open
  // ("AI", "Fastscan", ...), then "All documents" only at the true, filter-
  // free home. The breadcrumb row right below already spells out
  // "Documents" as its own first crumb, so a title that never changed
  // regardless of what was open was pure redundant chrome, not a helpful
  // "where am I" signal.
  const titleLabel = selectedCategory
    ? selectedCategory.name
    : mode === "all"
      ? "All documents"
      : (entityName ?? (mode === "team" ? "Team" : "Product"));

  // A single selected category (whether reached by clicking a folder tile
  // or by checking exactly one box in the Filter panel — both produce the
  // exact same state, `category=<one id>`, so there's no real difference to
  // preserve between them) is where you ARE, not a removable filter — hide
  // it from the Filter panel/chip row so that state doesn't show up twice,
  // once as the bold breadcrumb crumb and again as a chip. `selectedCategory`
  // alone (not `isFolderView`) is what actually distinguishes this from a
  // genuine multi-category filter: `category=id1,id2` never resolves to a
  // single Category via categories.find, so selectedCategory stays undefined
  // for a real multi-select and this correctly falls through to a filter chip.
  const filterCategoryId = selectedCategory ? undefined : selectedCategoryId;

  // Preserves every active filter/sort param when switching List <-> Tabs.
  const viewSwitcherHref = (() => {
    const url = new URL(categoryHref, "http://placeholder");
    if (status) url.searchParams.set("status", status);
    if (modifiedSince) url.searchParams.set("modifiedSince", modifiedSince);
    if (uploadedBy) url.searchParams.set("uploadedBy", uploadedBy);
    if (type) url.searchParams.set("type", type);
    if (pinned) url.searchParams.set("pinned", pinned);
    if (sort) url.searchParams.set("sort", sort);
    if (dir) url.searchParams.set("dir", dir);
    return `${url.pathname}${url.search}`;
  })();

  return (
    <div
      className="flex h-full flex-col rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          {/* Static, not a link — the breadcrumb row right below already
              has "Documents" as a clickable go-home crumb, so making the
              title clickable too was a second way to do the same thing,
              redundant and one more thing that looked interactive for no
              reason. */}
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-200">{titleLabel}</h1>
          <ViewSwitcher baseHref={viewSwitcherHref} view={view} hideFolders={!!selectedCategory} />
        </div>
        <FilterPanel
          baseHref={identityHref}
          categories={categories}
          categoryCounts={categoryCounts}
          status={status}
          modifiedSince={modifiedSince}
          uploadedBy={uploadedBy}
          type={type}
          category={filterCategoryId}
          pinned={pinned}
          uploaders={uploaders}
          scopeColors={scopeColors}
          categoryGroups={categoryGroups}
          categorySuperGroups={categorySuperGroups}
        />
      </div>

      <Breadcrumbs
        items={[
          { label: "Documents", href: documentsCrumbHref },
          // No second crumb in "all" mode — there's no specific team/product
          // to name, and "Documents" alone already conveys "everything."
          ...(mode === "all"
            ? []
            : [
                {
                  label: entityName ?? (mode === "team" ? "Team" : "Product"),
                  href: selectedCategory ? folderUpHref : undefined,
                },
              ]),
          ...(selectedCategory ? [{ label: selectedCategory.name }] : []),
        ]}
      />

      <AppliedFilters
        baseHref={fullCurrentHref}
        clearHref={clearAllHref}
        status={status}
        modifiedSince={modifiedSince}
        uploadedBy={uploadedBy}
        type={type}
        category={filterCategoryId}
        pinned={pinned}
        categories={categories}
        uploaders={uploaders}
        scopeColors={scopeColors}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {isFolderView && !selectedCategory ? (
          <FolderGrid categories={categories} documents={documents} baseHref={folderUpHref} scopeColors={scopeColors} />
        ) : view === "tabs" ? (
          <DocumentsCardGrid
            documents={documents}
            entityName={selectedCategory ? selectedCategory.name : entityName}
            scopeColors={scopeColors}
            restrictToPublished
          />
        ) : (
          <DocumentsTable
            documents={documents}
            mode={mode}
            entityId={entityId}
            entityName={selectedCategory ? selectedCategory.name : entityName}
            sort={sort}
            dir={dir}
            nameAscHref={nameAscHref}
            nameDescHref={nameDescHref}
            modifiedAscHref={modifiedAscHref}
            modifiedDescHref={modifiedDescHref}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            scopeColors={scopeColors}
            restrictToPublished
          />
        )}
      </div>
    </div>
  );
}

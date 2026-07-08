import type { Category, DocumentSummary, SortField, SortDir } from "@/lib/api";
import { FilterPanel } from "@/components/dashboard/FilterPanel";
import { AppliedFilters } from "@/components/dashboard/AppliedFilters";
import { Breadcrumbs } from "@/components/dashboard/Breadcrumbs";
import { DocumentsTable } from "@/components/dashboard/DocumentsTable";
import { DocumentsCardGrid } from "@/components/dashboard/DocumentsCardGrid";
import { FolderGrid } from "@/components/dashboard/FolderGrid";
import { ViewSwitcher, type ViewMode } from "@/components/dashboard/ViewSwitcher";

export function DocumentsPanel({
  mode,
  entityId,
  entityName,
  categories,
  selectedCategoryId,
  status,
  modifiedSince,
  type,
  sort,
  dir,
  view,
  documents,
  categoryCounts,
  isAdmin,
  currentUserId,
}: {
  mode: "team" | "product";
  entityId?: string;
  entityName?: string;
  categories: Category[];
  selectedCategoryId?: string;
  status?: string;
  modifiedSince?: string;
  type?: string;
  sort?: SortField;
  dir?: SortDir;
  view: ViewMode;
  documents: DocumentSummary[];
  categoryCounts?: Record<string, number>;
  isAdmin?: boolean;
  currentUserId?: string;
}) {
  const entityHref = entityId ? `/dashboard?mode=${mode}&entity=${entityId}` : "/dashboard";
  const categoryHref = selectedCategoryId ? `${entityHref}&category=${selectedCategoryId}` : entityHref;

  function sortHref(field: SortField, sortDir: SortDir) {
    return `${categoryHref}&sort=${field}&dir=${sortDir}`;
  }
  const nameAscHref = sortHref("name", "asc");
  const nameDescHref = sortHref("name", "desc");
  const modifiedAscHref = sortHref("modified", "asc");
  const modifiedDescHref = sortHref("modified", "desc");

  const isFolderView = view === "folders";
  const selectedCategory = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId)
    : undefined;
  // In folder view, going "up" a level means dropping the category but keeping the folder view itself.
  const folderUpHref = `${entityHref}&view=folders`;

  // The current location with no removable filters (status/date/type) — used
  // wherever an action should preserve view mode/folder without carrying over
  // one-off filters (the Filter panel's own base, and the breadcrumb root).
  const identityHref = isFolderView ? `${categoryHref}&view=folders` : categoryHref;

  // The full current URL, filters included — AppliedFilters needs this so
  // removing one chip out of a multi-select (e.g. one Type among several)
  // correctly preserves the others instead of wiping the whole filter.
  const fullCurrentHref = (() => {
    const url = new URL(identityHref, "http://placeholder");
    if (status) url.searchParams.set("status", status);
    if (modifiedSince) url.searchParams.set("modifiedSince", modifiedSince);
    if (type) url.searchParams.set("type", type);
    return `${url.pathname}${url.search}`;
  })();

  // Whether clicking "Documents" would actually change anything — if nothing
  // is filtered/sorted and we're already in plain list view, its target is
  // identical to the current page, so it should render as inert text rather
  // than a link that silently does nothing when clicked.
  const hasResettableState = Boolean(
    selectedCategoryId || status || modifiedSince || type || sort || dir || view !== "list",
  );
  const documentsCrumbHref = hasResettableState ? (isFolderView ? folderUpHref : entityHref) : undefined;

  // While drilled into a folder, the category is where you navigated, not a
  // removable filter — hide it from the Filter panel/chip row so that state
  // doesn't look identical to a plain list-view category filter (it's shown
  // once, correctly, as the bold breadcrumb crumb instead).
  const filterCategoryId = isFolderView && selectedCategory ? undefined : selectedCategoryId;

  // Preserves every active filter/sort param when switching List <-> Tabs.
  const viewSwitcherHref = (() => {
    const url = new URL(categoryHref, "http://placeholder");
    if (status) url.searchParams.set("status", status);
    if (modifiedSince) url.searchParams.set("modifiedSince", modifiedSince);
    if (type) url.searchParams.set("type", type);
    if (sort) url.searchParams.set("sort", sort);
    if (dir) url.searchParams.set("dir", dir);
    return `${url.pathname}${url.search}`;
  })();

  return (
    <div
      className="flex h-full flex-col rounded-lg border border-neutral-200 bg-white shadow-sm"
      style={{ fontFamily: "var(--font-ui)" }}
    >
      <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4">
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-neutral-900">Documents</h1>
          <ViewSwitcher baseHref={viewSwitcherHref} view={view} />
        </div>
        <FilterPanel
          baseHref={identityHref}
          categories={categories}
          categoryCounts={categoryCounts}
          status={status}
          modifiedSince={modifiedSince}
          type={type}
          category={filterCategoryId}
        />
      </div>

      <Breadcrumbs
        items={[
          { label: "Documents", href: documentsCrumbHref },
          {
            label: entityName ?? (mode === "team" ? "Team" : "Product"),
            href: isFolderView && selectedCategory ? folderUpHref : undefined,
          },
          ...(isFolderView && selectedCategory ? [{ label: selectedCategory.name }] : []),
        ]}
      />

      <AppliedFilters
        baseHref={fullCurrentHref}
        clearHref={identityHref}
        status={status}
        modifiedSince={modifiedSince}
        type={type}
        category={filterCategoryId}
        categories={categories}
      />

      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {isFolderView && !selectedCategory ? (
          <FolderGrid categories={categories} documents={documents} baseHref={folderUpHref} />
        ) : view === "tabs" ? (
          <DocumentsCardGrid documents={documents} entityName={entityName} />
        ) : (
          <DocumentsTable
            documents={documents}
            mode={mode}
            entityId={entityId}
            entityName={isFolderView && selectedCategory ? selectedCategory.name : entityName}
            sort={sort}
            dir={dir}
            nameAscHref={nameAscHref}
            nameDescHref={nameDescHref}
            modifiedAscHref={modifiedAscHref}
            modifiedDescHref={modifiedDescHref}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
          />
        )}
      </div>
    </div>
  );
}

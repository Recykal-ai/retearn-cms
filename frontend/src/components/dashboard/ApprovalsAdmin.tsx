"use client";

import { useMemo, useState, useTransition } from "react";
import type { DocumentSummary, Team, Product } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import { approveDocumentsAction, rejectDocumentsAction } from "@/app/dashboard/documents-actions";
import { useDocumentViewer } from "@/components/dashboard/useDocumentViewer";
import { useToast } from "@/components/ToastProvider";
import { Tag } from "@/components/dashboard/Tag";
import { colorForCategory, dedupeGlobalCategories, TEAM_TAG_COLOR, PRODUCT_TAG_COLOR } from "@/lib/tag-colors";
import { Icon } from "@/components/dashboard/Icon";
import { FilterSection } from "@/components/dashboard/FilterSection";
import { FilterTriggerButton } from "@/components/dashboard/FilterTriggerButton";
import { FilterDrawerHeader } from "@/components/dashboard/FilterDrawerHeader";
import { FilterDrawer } from "@/components/dashboard/FilterDrawer";
import { ModifiedDateSlider } from "@/components/dashboard/ModifiedDateSlider";
import { UploaderFilterSection, type UploaderOption } from "@/components/dashboard/UploaderFilterSection";
import {
  GroupedTagSection,
  type TagGroup,
  type TagSuperGroup,
  type GroupableCategory,
} from "@/components/dashboard/GroupedTagSection";
import { Pagination } from "@/components/dashboard/Pagination";

const PAGE_SIZE = 10;

export function ApprovalsAdmin({
  documents,
  teams,
  products,
}: {
  documents: DocumentSummary[];
  teams: Team[];
  products: Product[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rejectNoteOpen, setRejectNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();
  const { view, viewerNode } = useDocumentViewer();
  const { show } = useToast();

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedUploaders, setSelectedUploaders] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState("");
  const [page, setPage] = useState(1);

  const availableTeams = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const d of documents) {
      if (d.ownerTeam && !byId.has(d.ownerTeam.id)) byId.set(d.ownerTeam.id, d.ownerTeam);
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [documents]);

  const availableProducts = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const d of documents) {
      for (const p of d.products) {
        if (!byId.has(p.id)) byId.set(p.id, p);
      }
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [documents]);

  // Same Global/Team/Product tag-grouping pattern as PinnedPageContent.tsx —
  // see that file for the reasoning behind including global-flagged
  // categories in each entity's own group too, not just the flat aggregate.
  const { tagGroups, tagSuperGroups } = useMemo(() => {
    const teamIds = new Set(teams.map((t) => t.id));
    const scopeName = new Map<string, string>();
    for (const t of teams) scopeName.set(t.id, t.name);
    for (const p of products) scopeName.set(p.id, p.name);

    const globalByName = new Map<string, GroupableCategory>();
    const byScope = new Map<string, TagGroup>();
    for (const d of documents) {
      for (const c of d.categories) {
        if (c.isGlobal && !globalByName.has(c.name)) {
          globalByName.set(c.name, { id: c.name, name: c.name, scope: c.scope, isGlobal: true });
        }
        const group = byScope.get(c.scope) ?? { key: c.scope, label: scopeName.get(c.scope) ?? c.scope, categories: [] };
        if (!group.categories.some((existing) => existing.id === c.name)) {
          group.categories.push({ id: c.name, name: c.name, scope: c.scope, isGlobal: c.isGlobal });
        }
        byScope.set(c.scope, group);
      }
    }

    const teamGroups: TagGroup[] = [];
    const productGroups: TagGroup[] = [];
    for (const group of byScope.values()) {
      (teamIds.has(group.key) ? teamGroups : productGroups).push(group);
    }
    teamGroups.sort((a, b) => a.label.localeCompare(b.label));
    productGroups.sort((a, b) => a.label.localeCompare(b.label));

    const tagSuperGroups: TagSuperGroup[] = [
      ...(teamGroups.length ? [{ key: "__teams__", label: "Team", groups: teamGroups }] : []),
      ...(productGroups.length ? [{ key: "__products__", label: "Product", groups: productGroups }] : []),
    ];
    const tagGroups: TagGroup[] =
      globalByName.size === 0
        ? []
        : [
            {
              key: "__global__",
              label: "Global tags",
              categories: Array.from(globalByName.values()).sort((a, b) => a.name.localeCompare(b.name)),
            },
          ];
    return { tagGroups, tagSuperGroups };
  }, [documents, teams, products]);

  const availableUploaders = useMemo(() => {
    const byId = new Map<string, UploaderOption>();
    for (const d of documents) {
      const existing = byId.get(d.uploadedBy.id);
      if (existing) existing.count += 1;
      else byId.set(d.uploadedBy.id, { id: d.uploadedBy.id, name: d.uploadedBy.name, email: d.uploadedBy.email, count: 1 });
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [documents]);

  const activeFilterCount =
    selectedTeams.length + selectedProducts.length + selectedCategories.length + selectedUploaders.length + (selectedDays ? 1 : 0);

  const filtered = documents.filter((d) => {
    if (query.trim() && !d.title.toLowerCase().includes(query.trim().toLowerCase())) return false;
    if (selectedTeams.length && !(d.ownerTeam && selectedTeams.includes(d.ownerTeam.id))) return false;
    if (selectedProducts.length && !d.products.some((p) => selectedProducts.includes(p.id))) return false;
    if (selectedCategories.length && !d.categories.some((c) => selectedCategories.includes(c.name))) return false;
    if (selectedUploaders.length && !selectedUploaders.includes(d.uploadedBy.id)) return false;
    if (selectedDays) {
      const cutoff = Date.now() - Number(selectedDays) * 86400000;
      if (new Date(d.createdAt).getTime() < cutoff) return false;
    }
    return true;
  });

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const paged = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function toggleFilter(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
    setPage(1);
  }

  function clearFilters() {
    setSelectedTeams([]);
    setSelectedProducts([]);
    setSelectedCategories([]);
    setSelectedUploaders([]);
    setSelectedDays("");
    setPage(1);
  }

  function onQueryChange(next: string) {
    setQuery(next);
    setPage(1);
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => (prev.size === paged.length ? new Set() : new Set(paged.map((d) => d.id))));
  }

  function handleApprove() {
    const ids = Array.from(selected);
    startTransition(async () => {
      const result = await approveDocumentsAction(ids);
      show(result.error ?? `Approved ${ids.length} document${ids.length === 1 ? "" : "s"}.`, result.error ? "error" : "success");
      setSelected(new Set());
    });
  }

  function handleReject() {
    const ids = Array.from(selected);
    startTransition(async () => {
      const result = await rejectDocumentsAction(ids, note);
      show(result.error ?? `Rejected ${ids.length} document${ids.length === 1 ? "" : "s"}.`, result.error ? "error" : "success");
      setSelected(new Set());
      setNote("");
      setRejectNoteOpen(false);
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3 border-b border-neutral-100 px-6 py-3 dark:border-neutral-800">
        <div className="relative max-w-xs flex-1">
          <Icon
            name="Interface/Search_Magnifying_Glass"
            size={13}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400 dark:text-neutral-500"
          />
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Find in Approval requests…"
            className="w-full rounded-md border border-neutral-200 bg-white py-1.5 pr-3 pl-8 text-xs text-neutral-700 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300 dark:placeholder:text-neutral-500"
          />
        </div>
        <FilterTriggerButton activeCount={activeFilterCount} onClick={() => setOpen(true)} />
      </div>

      <FilterDrawer open={open} onClose={() => setOpen(false)}>
        <FilterDrawerHeader onClose={() => setOpen(false)} onClear={clearFilters} showClear={activeFilterCount > 0} />

        <div className="flex-1 px-5 py-4">
          <FilterSection title="Modified">
            <ModifiedDateSlider
              value={selectedDays}
              onChange={(v) => {
                setSelectedDays(v);
                setPage(1);
              }}
            />
          </FilterSection>

          {availableUploaders.length > 0 && (
            <FilterSection title={`Submitted By${selectedUploaders.length ? ` (${selectedUploaders.length})` : ""}`}>
              <UploaderFilterSection
                uploaders={availableUploaders}
                selected={selectedUploaders}
                onToggle={(id) => toggleFilter(selectedUploaders, setSelectedUploaders, id)}
              />
            </FilterSection>
          )}

          {availableTeams.length > 0 && (
            <FilterSection title={`Team${selectedTeams.length ? ` (${selectedTeams.length})` : ""}`}>
              <div className="flex flex-col gap-1.5">
                {availableTeams.map((t) => (
                  <label key={t.id} className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={selectedTeams.includes(t.id)}
                      onChange={() => toggleFilter(selectedTeams, setSelectedTeams, t.id)}
                    />
                    {t.name}
                  </label>
                ))}
              </div>
            </FilterSection>
          )}

          {availableProducts.length > 0 && (
            <FilterSection title={`Product${selectedProducts.length ? ` (${selectedProducts.length})` : ""}`}>
              <div className="flex flex-col gap-1.5">
                {availableProducts.map((p) => (
                  <label key={p.id} className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                    <input
                      type="checkbox"
                      checked={selectedProducts.includes(p.id)}
                      onChange={() => toggleFilter(selectedProducts, setSelectedProducts, p.id)}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </FilterSection>
          )}

          {(tagGroups.length > 0 || tagSuperGroups.length > 0) && (
            <FilterSection title={`Tags${selectedCategories.length ? ` (${selectedCategories.length})` : ""}`} last>
              <GroupedTagSection
                groups={tagGroups}
                superGroups={tagSuperGroups}
                selected={selectedCategories}
                onToggle={(id) => toggleFilter(selectedCategories, setSelectedCategories, id)}
              />
            </FilterSection>
          )}
        </div>
      </FilterDrawer>

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-400 dark:text-neutral-500">
          {documents.length === 0
            ? "Nothing waiting on review right now."
            : query
              ? `No matches for "${query}".`
              : "No documents match these filters."}
        </p>
      ) : (
        <>
          {/* Always mounted (visibility toggled via `invisible`, not
              conditional rendering) so checking the first box doesn't change
              this row's height and nudge the table below it down. */}
          <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-3 dark:border-neutral-800">
            <label className="flex items-center gap-2 text-xs font-medium text-neutral-500 dark:text-neutral-400">
              <input
                type="checkbox"
                checked={selected.size > 0 && selected.size === paged.length}
                onChange={toggleAll}
                className="rounded border-neutral-300"
              />
              {selected.size > 0 ? `${selected.size} selected` : "Select all"}
            </label>

            <div className={`flex items-center gap-2 ${selected.size > 0 ? "" : "invisible pointer-events-none"}`}>
              <button
                type="button"
                onClick={handleApprove}
                disabled={isPending}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                style={{ background: "#2e7d3f" }}
              >
                Approve
              </button>
              <button
                type="button"
                onClick={() => setRejectNoteOpen((v) => !v)}
                disabled={isPending}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                style={{ background: "#b3342c" }}
              >
                Reject
              </button>
            </div>
          </div>

          {rejectNoteOpen && (
            <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50 px-6 py-3 dark:border-neutral-800 dark:bg-neutral-800">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Reason for rejection (shown to the uploader)"
                className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-200"
              />
              <button
                type="button"
                onClick={handleReject}
                disabled={isPending || !note.trim()}
                className="rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                style={{ background: "#b3342c" }}
              >
                Confirm reject
              </button>
            </div>
          )}

          <div className="px-6">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-neutral-100 text-xs font-semibold text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
                  <th className="w-8 py-3" />
                  <th className="py-3 whitespace-nowrap">Name</th>
                  <th className="min-w-[16rem] py-3">Tags</th>
                  <th className="w-32 py-3 whitespace-nowrap">Submitted</th>
                  <th className="w-40 py-3 pr-4 whitespace-nowrap">Submitted by</th>
                  <th className="w-16 py-3" />
                </tr>
              </thead>
              <tbody>
                {paged.map((doc) => (
                  <tr key={doc.id} className="border-b border-neutral-50 last:border-0 hover:bg-neutral-50/60 dark:border-neutral-800 dark:hover:bg-neutral-800/60">
                    <td className="py-3">
                      <input
                        type="checkbox"
                        checked={selected.has(doc.id)}
                        onChange={() => toggle(doc.id)}
                        className="rounded border-neutral-300"
                      />
                    </td>
                    <td className="py-3 pr-4 font-medium whitespace-nowrap text-neutral-800 dark:text-neutral-200">{doc.title}</td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap gap-1.5">
                        {doc.ownerTeam && <Tag label={doc.ownerTeam.name} bg={TEAM_TAG_COLOR.bg} fg={TEAM_TAG_COLOR.fg} />}
                        {doc.products.map((p) => (
                          <Tag key={p.id} label={p.name} bg={PRODUCT_TAG_COLOR.bg} fg={PRODUCT_TAG_COLOR.fg} />
                        ))}
                        {dedupeGlobalCategories(doc.categories).map((c) => {
                          const color = colorForCategory(c);
                          return <Tag key={c.id} label={c.name} bg={color.bg} fg={color.fg} />;
                        })}
                      </div>
                    </td>
                    <td className="py-3 text-neutral-500 whitespace-nowrap dark:text-neutral-400" suppressHydrationWarning>
                      {relativeTime(doc.createdAt)}
                    </td>
                    <td className="py-3 pr-4 text-neutral-500 whitespace-nowrap dark:text-neutral-400">{doc.uploadedBy.name}</td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => view(doc)}
                        className="text-xs font-medium"
                        style={{ color: "var(--brand-purple)" }}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {pageCount > 1 && <Pagination page={currentPage} pageCount={pageCount} onChange={setPage} />}
        </>
      )}
      {viewerNode}
    </div>
  );
}

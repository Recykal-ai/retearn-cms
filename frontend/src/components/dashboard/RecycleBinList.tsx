"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { DeletedDocumentSummary, Team, Product } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import { FileTypeIcon } from "@/components/dashboard/FileTypeIcon";
import { Tag } from "@/components/dashboard/Tag";
import { fileTypeOf, FILE_TYPE_LABEL, type FileTypeKey } from "@/lib/file-type";
import { colorForCategory, dedupeGlobalCategories, TEAM_TAG_COLOR, PRODUCT_TAG_COLOR } from "@/lib/tag-colors";
import { recoverDocumentAction } from "@/app/dashboard/recycle-bin/recycle-bin-actions";
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

// Search box + filter drawer mirror Pinned's exact pattern (PinnedPageContent
// / DocumentsCardGrid's "Find in X…" box) — same local-state, derived-from-
// what's-actually-here approach, no URL params or server round trip, since
// the Recycle Bin is a small, admin-only, already-fully-loaded list.
export function RecycleBinList({
  documents,
  teams,
  products,
}: {
  documents: DeletedDocumentSummary[];
  teams: Team[];
  products: Product[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedUploaders, setSelectedUploaders] = useState<string[]>([]);
  const [selectedDays, setSelectedDays] = useState("");

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const availableTypes = useMemo(() => {
    const set = new Set<FileTypeKey>();
    for (const d of documents) set.add(fileTypeOf(d.title, d.sourceType));
    return Array.from(set);
  }, [documents]);

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

  // "Global tags" is a flat aggregate group (one entry per distinct global
  // tag name); every Team/Product's own group additionally includes ALL of
  // its categories, global ones included — a product whose tags happen to
  // be entirely global (a real case, e.g. a "Goa DRS" tag bulk-created
  // across every team/product) still needs its own group, not vanish
  // because none of its tags were non-global. Team and Product groups nest
  // under their own "Team"/"Product" super-section rather than one long
  // flat list mixing every team and product together.
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

  // "Modified By" is the original uploader (d.uploadedBy) — distinct from
  // the "Deleted by" column/d.deletedBy already shown in the table.
  const availableUploaders = useMemo(() => {
    const byId = new Map<string, UploaderOption>();
    for (const d of documents) {
      const existing = byId.get(d.uploadedBy.id);
      if (existing) existing.count += 1;
      else byId.set(d.uploadedBy.id, { id: d.uploadedBy.id, name: d.uploadedBy.name, email: d.uploadedBy.email, count: 1 });
    }
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [documents]);

  const activeCount =
    selectedTypes.length +
    selectedTeams.length +
    selectedProducts.length +
    selectedCategories.length +
    selectedUploaders.length +
    (selectedDays ? 1 : 0);

  const filtered = documents.filter((d) => {
    const q = query.trim().toLowerCase();
    if (q && !d.title.toLowerCase().includes(q) && !d.categories.some((c) => c.name.toLowerCase().includes(q))) {
      return false;
    }
    if (selectedTypes.length && !selectedTypes.includes(fileTypeOf(d.title, d.sourceType))) return false;
    if (selectedTeams.length && !(d.ownerTeam && selectedTeams.includes(d.ownerTeam.id))) return false;
    if (selectedProducts.length && !d.products.some((p) => selectedProducts.includes(p.id))) return false;
    if (selectedCategories.length && !d.categories.some((c) => selectedCategories.includes(c.name))) return false;
    if (selectedUploaders.length && !selectedUploaders.includes(d.uploadedBy.id)) return false;
    if (selectedDays) {
      const cutoff = Date.now() - Number(selectedDays) * 86400000;
      if (!d.deletedBy || new Date(d.deletedBy.at).getTime() < cutoff) return false;
    }
    return true;
  });

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  function clear() {
    setSelectedTypes([]);
    setSelectedTeams([]);
    setSelectedProducts([]);
    setSelectedCategories([]);
    setSelectedUploaders([]);
    setSelectedDays("");
  }

  if (documents.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Icon name="Interface/Trash_Empty" size={36} style={{ color: "#c9c2ce" }} />
        <p className="text-sm font-medium text-neutral-600">Recycle Bin is empty.</p>
        <p className="max-w-xs text-xs text-neutral-400">Documents deleted by an Admin or Super Admin show up here and can be recovered.</p>
      </div>
    );
  }

  return (
    <div className="px-6 pb-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="relative max-w-xs flex-1">
          <Icon
            name="Interface/Search_Magnifying_Glass"
            size={13}
            className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find in Recycle Bin…"
            className="w-full rounded-md border border-neutral-200 bg-white py-1.5 pr-3 pl-8 text-xs text-neutral-700 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none"
          />
        </div>
        <FilterTriggerButton activeCount={activeCount} onClick={() => setOpen(true)} />
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <Icon name="Interface/Trash_Empty" size={36} style={{ color: "#c9c2ce" }} />
          <p className="text-sm font-medium text-neutral-600">
            {query || activeCount > 0 ? "No deleted documents match these filters." : "Recycle Bin is empty."}
          </p>
        </div>
      ) : (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-neutral-100 text-xs font-semibold text-neutral-500">
              <th className="py-3 pr-4 font-semibold">Name</th>
              <th className="py-3 pr-4 font-semibold">Tags</th>
              <th className="w-40 py-3 pr-4 font-semibold">Deleted by</th>
              <th className="w-28 py-3 pr-4 font-semibold">Deleted</th>
              <th className="w-28 py-3 font-normal" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((doc) => (
              <RecycleBinRow key={doc.id} doc={doc} />
            ))}
          </tbody>
        </table>
      )}

      <FilterDrawer open={open} onClose={() => setOpen(false)}>
        <FilterDrawerHeader onClose={() => setOpen(false)} onClear={clear} showClear={activeCount > 0} />

        <div className="flex-1 px-5 py-4">
              {availableTypes.length > 0 && (
                <FilterSection title={`Type${selectedTypes.length ? ` (${selectedTypes.length})` : ""}`}>
                  <div className="flex flex-col gap-1.5">
                    {availableTypes.map((t) => (
                      <label key={t} className="flex items-center gap-2 text-sm text-neutral-700">
                        <input
                          type="checkbox"
                          checked={selectedTypes.includes(t)}
                          onChange={() => toggle(selectedTypes, setSelectedTypes, t)}
                        />
                        <FileTypeIcon type={t} />
                        {FILE_TYPE_LABEL[t]}
                      </label>
                    ))}
                  </div>
                </FilterSection>
              )}

              <FilterSection title="Deleted">
                <ModifiedDateSlider value={selectedDays} onChange={setSelectedDays} />
              </FilterSection>

              {availableUploaders.length > 0 && (
                <FilterSection title={`Modified By${selectedUploaders.length ? ` (${selectedUploaders.length})` : ""}`}>
                  <UploaderFilterSection
                    uploaders={availableUploaders}
                    selected={selectedUploaders}
                    onToggle={(id) => toggle(selectedUploaders, setSelectedUploaders, id)}
                  />
                </FilterSection>
              )}

              {availableTeams.length > 0 && (
                <FilterSection title={`Team${selectedTeams.length ? ` (${selectedTeams.length})` : ""}`}>
                  <div className="flex flex-col gap-1.5">
                    {availableTeams.map((t) => (
                      <label key={t.id} className="flex items-center gap-2 text-sm text-neutral-700">
                        <input
                          type="checkbox"
                          checked={selectedTeams.includes(t.id)}
                          onChange={() => toggle(selectedTeams, setSelectedTeams, t.id)}
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
                      <label key={p.id} className="flex items-center gap-2 text-sm text-neutral-700">
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(p.id)}
                          onChange={() => toggle(selectedProducts, setSelectedProducts, p.id)}
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
                    onToggle={(id) => toggle(selectedCategories, setSelectedCategories, id)}
                  />
                </FilterSection>
              )}
        </div>
      </FilterDrawer>
    </div>
  );
}

function RecycleBinRow({ doc }: { doc: DeletedDocumentSummary }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function handleRecover() {
    startTransition(async () => {
      const result = await recoverDocumentAction(doc.id);
      if (result.error) setError(result.error);
    });
  }

  return (
    <tr className="border-b border-neutral-50 last:border-0">
      <td className="py-3 pr-4">
        <div className="flex items-center gap-2">
          <FileTypeIcon type={fileTypeOf(doc.title, doc.sourceType)} />
          <span className="font-medium text-neutral-800">{doc.title}</span>
        </div>
      </td>
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
      <td className="py-3 pr-4 text-neutral-500">{doc.deletedBy?.name ?? "—"}</td>
      <td className="py-3 pr-4 text-neutral-500" suppressHydrationWarning>
        {doc.deletedBy ? relativeTime(doc.deletedBy.at) : "—"}
      </td>
      <td className="py-3">
        <button
          type="button"
          onClick={handleRecover}
          disabled={isPending}
          className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-60"
        >
          {isPending ? "Recovering…" : "Recover"}
        </button>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}

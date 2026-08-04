"use client";

import { useEffect, useMemo, useState } from "react";
import type { DocumentSummary, Team, Product } from "@/lib/api";
import { DocumentsCardGrid } from "@/components/dashboard/DocumentsCardGrid";
import { FileTypeIcon } from "@/components/dashboard/FileTypeIcon";
import { fileTypeOf, FILE_TYPE_LABEL, type FileTypeKey } from "@/lib/file-type";
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

// Pinned is a personal, cross-team/product list — its filter options are
// derived straight from whatever's actually pinned (no server round trip for
// a categoriesByScope catalog like the main dashboard's Filter panel needs),
// and kept as local state rather than URL params since there's nothing else
// on this page to deep-link back to. The drawer shell itself (right-side
// slide-in, same header/section/footer markup) intentionally mirrors
// FilterPanel.tsx's rather than using its own popover style, so filtering
// looks and behaves the same everywhere in the app.
export function PinnedPageContent({
  documents,
  teams,
  products,
}: {
  documents: DocumentSummary[];
  teams: Team[];
  products: Product[];
}) {
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
    if (selectedTypes.length && !selectedTypes.includes(fileTypeOf(d.title, d.sourceType))) return false;
    if (selectedTeams.length && !(d.ownerTeam && selectedTeams.includes(d.ownerTeam.id))) return false;
    if (selectedProducts.length && !d.products.some((p) => selectedProducts.includes(p.id))) return false;
    if (selectedCategories.length && !d.categories.some((c) => selectedCategories.includes(c.name))) return false;
    if (selectedUploaders.length && !selectedUploaders.includes(d.uploadedBy.id)) return false;
    if (selectedDays) {
      const cutoff = Date.now() - Number(selectedDays) * 86400000;
      if (new Date(d.updatedAt).getTime() < cutoff) return false;
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

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <FilterTriggerButton activeCount={activeCount} onClick={() => setOpen(true)} />
      </div>

      <FilterDrawer open={open} onClose={() => setOpen(false)}>
        <FilterDrawerHeader onClose={() => setOpen(false)} onClear={clear} showClear={activeCount > 0} />

        <div className="flex-1 px-5 py-4">
              <FilterSection title="Modified">
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

      {filtered.length === 0 ? (
        <p className="py-16 text-center text-sm text-neutral-400">No pinned documents match these filters.</p>
      ) : (
        <DocumentsCardGrid documents={filtered} entityName="Pinned" />
      )}
    </div>
  );
}

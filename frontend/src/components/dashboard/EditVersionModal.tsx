"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DocumentSummary, Team, Product, Category } from "@/lib/api";
import { pushVersionAction, updateDocumentTagsAction, getTagCatalogAction } from "@/app/dashboard/documents-actions";
import { colorForCategory, buildScopeColorMap, TEAM_TAG_COLOR, PRODUCT_TAG_COLOR } from "@/lib/tag-colors";

// See UploadModal.tsx for why global categories (one row per team/product,
// Category.isGlobal) need grouping rather than a flat per-id list here too,
// and for why selection is tracked by `key` (stable per group name) rather
// than by raw member id — the same "adding a new product later doesn't
// retroactively re-tag an already-checked global category for it" bug
// applied here too, on every existing doc's tag-edit flow, not just upload.
interface CategoryOption {
  id: string;
  key: string;
  name: string;
  scope: string;
  isGlobal: boolean;
  memberIds: string[];
}

function groupCategories(categoriesByScope: Record<string, Category[]>, scopes: string[]): CategoryOption[] {
  const byId = new Map<string, Category>();
  for (const scope of scopes) {
    for (const c of categoriesByScope[scope] ?? []) byId.set(c.id, c);
  }
  const groups = new Map<string, CategoryOption>();
  for (const c of byId.values()) {
    const key = c.isGlobal ? `global:${c.name}` : c.id;
    const existing = groups.get(key);
    if (existing) existing.memberIds.push(c.id);
    else groups.set(key, { id: c.id, key, name: c.name, scope: c.scope, isGlobal: c.isGlobal, memberIds: [c.id] });
  }
  // Global tags first, alphabetical within each group — merging across
  // multiple scopes above can otherwise interleave them with per-scope tags
  // depending on which scope's rows happened to be inserted first.
  return Array.from(groups.values()).sort((a, b) => {
    const globalDiff = Number(b.isGlobal) - Number(a.isGlobal);
    return globalDiff !== 0 ? globalDiff : a.name.localeCompare(b.name);
  });
}

// Same key shape groupCategories uses (`global:<name>` for a global
// category, the raw id otherwise) — how an existing document's already-
// tagged categories seed the initial selectedKeys state below.
function keyFor(c: { id: string; name: string; isGlobal: boolean }): string {
  return c.isGlobal ? `global:${c.name}` : c.id;
}

export function EditVersionModal({
  doc,
  onClose,
}: {
  doc: DocumentSummary;
  onClose: () => void;
}) {
  const [fileName, setFileName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkUrlRef = useRef<HTMLInputElement>(null);

  const [catalog, setCatalog] = useState<{
    teams: Team[];
    products: Product[];
    categoriesByScope: Record<string, Category[]>;
  } | null>(null);
  const [ownerTeamId, setOwnerTeamId] = useState<string | null>(doc.ownerTeam?.id ?? null);
  const [productIds, setProductIds] = useState<string[]>(doc.products.map((p) => p.id));
  const [selectedKeys, setSelectedKeys] = useState<string[]>(doc.categories.map(keyFor));
  const [tagQuery, setTagQuery] = useState("");

  useEffect(() => {
    getTagCatalogAction().then(setCatalog);
  }, []);

  const availableCategories = useMemo(() => {
    if (!catalog) return [];
    const scopes = [ownerTeamId, ...productIds].filter((v): v is string => Boolean(v));
    return groupCategories(catalog.categoriesByScope, scopes);
  }, [catalog, ownerTeamId, productIds]);

  // Every team/product's own tag chip color, same assignment page.tsx uses
  // for the dashboard — keeps a tag's color consistent between browsing it
  // and re-tagging an existing document with it.
  const scopeColors = useMemo(
    () => (catalog ? buildScopeColorMap([...catalog.teams, ...catalog.products].map((e) => e.id)) : undefined),
    [catalog],
  );

  // The real ids actually submitted — re-derived every render from
  // availableCategories (itself scope-derived), so a global group's
  // expanded/shrunk memberIds are always reflected without needing to
  // separately sync anything when ownerTeamId/productIds change.
  const selectedCategoryIds = availableCategories.filter((c) => selectedKeys.includes(c.key)).flatMap((c) => c.memberIds);
  const filteredCategories = tagQuery.trim()
    ? availableCategories.filter((c) => c.name.toLowerCase().includes(tagQuery.trim().toLowerCase()))
    : availableCategories;

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((v) => v !== id) : [...list, id]);
  }

  function toggleCategoryGroup(c: CategoryOption) {
    setSelectedKeys(selectedKeys.includes(c.key) ? selectedKeys.filter((k) => k !== c.key) : [...selectedKeys, c.key]);
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFileName(file?.name ?? "");
    if (file) {
      setLinkUrl("");
      if (linkUrlRef.current) linkUrlRef.current.value = "";
    }
  }

  function onLinkChange() {
    const hasLinkInput = (linkUrlRef.current?.value ?? "").length > 0;
    if (hasLinkInput && fileName) {
      setFileName("");
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
    setLinkUrl(linkUrlRef.current?.value ?? "");
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!ownerTeamId && productIds.length === 0) {
      setError("Pick at least one team or product tag.");
      return;
    }
    // Only force a pick when there's actually something to pick from — a
    // team/product with no tags set up yet falls back to "Others" server-side.
    if (availableCategories.length > 0 && selectedCategoryIds.length === 0) {
      setError("Pick at least one category tag.");
      return;
    }

    setError("");
    setSubmitting(true);

    // Tags first, then the (optional) new version — so a scoped-admin/soft-lock
    // rejection on the tag change never leaves a half-applied edit.
    const tagsResult = await updateDocumentTagsAction(doc.id, {
      ownerTeamId,
      productIds,
      categoryIds: selectedCategoryIds,
    });
    if (tagsResult.error) {
      setError(tagsResult.error);
      setSubmitting(false);
      return;
    }

    if (fileName || linkUrl) {
      const versionFormData = new FormData();
      versionFormData.set("sourceType", fileName ? "FILE" : "LINK");
      if (fileName && fileInputRef.current?.files?.[0]) {
        versionFormData.set("file", fileInputRef.current.files[0]);
      }
      if (linkUrl) versionFormData.set("externalUrl", linkUrl);
      if (note.trim()) versionFormData.set("note", note.trim());
      try {
        await pushVersionAction(doc.id, versionFormData);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to upload new version");
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(false);
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      style={{ fontFamily: "var(--font-ui)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <form
        onSubmit={handleSubmit}
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl dark:bg-neutral-900"
      >
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-200">Edit document</h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-xl leading-none text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
          >
            ×
          </button>
        </div>
        <p className="mb-5 truncate text-xs text-neutral-400 dark:text-neutral-500">&ldquo;{doc.title}&rdquo;</p>

        {!catalog ? (
          <p className="mb-5 text-sm text-neutral-400 dark:text-neutral-500">Loading tags…</p>
        ) : (
          <>
            <div className="mb-4">
              <label className="mb-1.5 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">Team</label>
              <div className="flex flex-wrap gap-2">
                {catalog.teams.map((t) => {
                  const selected = ownerTeamId === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setOwnerTeamId(selected ? null : t.id)}
                      className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                      style={
                        selected
                          ? { background: TEAM_TAG_COLOR.fg, color: "white" }
                          : { background: TEAM_TAG_COLOR.bg, color: TEAM_TAG_COLOR.fg }
                      }
                    >
                      {t.name}
                    </button>
                  );
                })}
              </div>
            </div>

            {catalog.products.length > 0 && (
              <div className="mb-4">
                <label className="mb-1.5 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">Product</label>
                <div className="flex flex-wrap gap-2">
                  {catalog.products.map((p) => {
                    const selected = productIds.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => toggle(productIds, setProductIds, p.id)}
                        className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                        style={
                          selected
                            ? { background: PRODUCT_TAG_COLOR.fg, color: "white" }
                            : { background: PRODUCT_TAG_COLOR.bg, color: PRODUCT_TAG_COLOR.fg }
                        }
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="mb-5">
              <label className="mb-1.5 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">Tags</label>
              {availableCategories.length === 0 ? (
                <p className="text-xs text-neutral-400 dark:text-neutral-500">
                  {ownerTeamId || productIds.length > 0
                    ? 'No tags set up here yet — this will be filed under "Others".'
                    : "Pick a team or product above to see its tags."}
                </p>
              ) : (
                <>
                  {availableCategories.length > 8 && (
                    <input
                      type="text"
                      value={tagQuery}
                      onChange={(e) => setTagQuery(e.target.value)}
                      placeholder="Find a tag"
                      className="mb-2 w-full rounded-md border border-neutral-200 px-3 py-1.5 text-xs text-neutral-700 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none dark:border-neutral-700 dark:text-neutral-300 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600"
                    />
                  )}
                  <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                    {filteredCategories.length === 0 && (
                      <p className="text-xs text-neutral-400 italic dark:text-neutral-500">No matching tags</p>
                    )}
                    {filteredCategories.map((c) => {
                      const selected = selectedKeys.includes(c.key);
                      const color = colorForCategory(c, scopeColors);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => toggleCategoryGroup(c)}
                          className="rounded-full px-3 py-1 text-xs font-medium transition-colors"
                          style={
                            selected
                              ? { background: color.fg, color: "white" }
                              : { background: color.bg, color: color.fg }
                          }
                        >
                          {c.name}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        <div className="mb-2 flex items-center gap-3 text-xs font-medium text-neutral-400 dark:text-neutral-500">
          <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
          Replace the file (optional)
          <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">Replace with a file</label>
          <input
            ref={fileInputRef}
            type="file"
            name="file"
            onChange={onFileChange}
            className="w-full rounded-md border border-dashed border-neutral-300 px-3 py-4 text-sm text-neutral-600 dark:border-neutral-600 dark:text-neutral-400"
          />
        </div>

        <div className="mb-4 flex items-center gap-3 text-xs font-medium text-neutral-400 dark:text-neutral-500">
          <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
          or
          <div className="h-px flex-1 bg-neutral-200 dark:bg-neutral-700" />
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">Replace with a link</label>
          <input
            ref={linkUrlRef}
            type="url"
            name="externalUrl"
            placeholder="https://docs.google.com/document/d/…"
            onChange={onLinkChange}
            className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none dark:border-neutral-600 dark:focus:border-neutral-500"
          />
        </div>

        <div className="mb-5">
          <label className="mb-1.5 block text-xs font-semibold text-neutral-600 dark:text-neutral-400">Description (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder="Describe what changed in this version, for anyone checking version history later."
            className="w-full resize-none rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none dark:border-neutral-600 dark:focus:border-neutral-500"
          />
        </div>

        {error && <p className="mb-3 text-xs font-medium text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !catalog}
          className="w-full rounded-md py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
          style={{ background: "var(--brand-purple)" }}
        >
          {submitting ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

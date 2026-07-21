"use client";

import { useMemo, useRef, useState } from "react";
import type { Team, Product, Category } from "@/lib/api";
import { colorForCategory, TEAM_TAG_COLOR, PRODUCT_TAG_COLOR } from "@/lib/tag-colors";
import { Icon } from "@/components/dashboard/Icon";

// A global category is one row per team/product (Category.isGlobal), so
// picking Team AI + Product Ace can surface two separate "Goa DRS" rows —
// one per scope. They're grouped into a single chip here; toggling it
// selects/deselects every underlying row currently in play, so the document
// still ends up correctly tagged (and findable) in every selected scope,
// not just whichever row happened to render first.
interface CategoryOption {
  id: string;
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
    else groups.set(key, { id: c.id, name: c.name, scope: c.scope, isGlobal: c.isGlobal, memberIds: [c.id] });
  }
  // Global tags first, alphabetical within each group — merging across
  // multiple scopes above can otherwise interleave them with per-scope tags
  // depending on which scope's rows happened to be inserted first.
  return Array.from(groups.values()).sort((a, b) => {
    const globalDiff = Number(b.isGlobal) - Number(a.isGlobal);
    return globalDiff !== 0 ? globalDiff : a.name.localeCompare(b.name);
  });
}

export function UploadModal({
  teams,
  products,
  categoriesByScope,
  action,
}: {
  teams: Team[];
  products: Product[];
  categoriesByScope: Record<string, Category[]>;
  action: (formData: FormData) => void;
}) {
  const [open, setOpen] = useState(false);
  const [ownerTeamId, setOwnerTeamId] = useState<string | null>(null);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkUrlRef = useRef<HTMLInputElement>(null);
  const linkTitleRef = useRef<HTMLInputElement>(null);

  const availableCategories = useMemo(() => {
    const scopes = [ownerTeamId, ...productIds].filter((v): v is string => Boolean(v));
    return groupCategories(categoriesByScope, scopes);
  }, [ownerTeamId, productIds, categoriesByScope]);

  const availableCategoryIds = new Set(availableCategories.flatMap((c) => c.memberIds));
  const selectedCategoryIds = categoryIds.filter((id) => availableCategoryIds.has(id));
  const filteredCategories = tagQuery.trim()
    ? availableCategories.filter((c) => c.name.toLowerCase().includes(tagQuery.trim().toLowerCase()))
    : availableCategories;
  const sourceType = fileName ? "FILE" : "LINK";

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((v) => v !== id) : [...list, id]);
  }

  function toggleCategoryGroup(c: CategoryOption) {
    const anySelected = c.memberIds.some((id) => categoryIds.includes(id));
    setCategoryIds(
      anySelected
        ? categoryIds.filter((id) => !c.memberIds.includes(id))
        : [...categoryIds, ...c.memberIds.filter((id) => !categoryIds.includes(id))],
    );
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    setFileName(file?.name ?? "");
    if (file) {
      setLinkUrl("");
      if (linkUrlRef.current) linkUrlRef.current.value = "";
      if (linkTitleRef.current) linkTitleRef.current.value = "";
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

  function close() {
    setOpen(false);
    setOwnerTeamId(null);
    setProductIds([]);
    setCategoryIds([]);
    setFileName("");
    setLinkUrl("");
    setTagQuery("");
    setError("");
    setSubmitting(false);
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    if (!ownerTeamId && productIds.length === 0) {
      e.preventDefault();
      setError("Pick at least one team or product tag.");
      return;
    }
    // Only force a pick when there's actually something to pick from — a
    // team/product with no tags set up yet falls back to "Others" server-side.
    if (availableCategories.length > 0 && selectedCategoryIds.length === 0) {
      e.preventDefault();
      setError("Pick at least one category tag.");
      return;
    }
    if (!fileName && !linkUrl) {
      e.preventDefault();
      setError("Choose a file or paste a link.");
      return;
    }
    setError("");
    setSubmitting(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-sm font-semibold text-neutral-700 transition-colors hover:text-neutral-900"
      >
        <span aria-hidden className="text-base leading-none text-neutral-500">
          +
        </span>
        Upload
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          style={{ fontFamily: "var(--font-ui)" }}
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <form
            action={action}
            onSubmit={handleSubmit}
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
          >
            <div className="mb-5 flex items-center justify-between">
              <h1 className="text-lg font-semibold text-neutral-900">Upload a document</h1>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="text-xl leading-none text-neutral-400 hover:text-neutral-600"
              >
                ×
              </button>
            </div>

            <div className="mb-5">
              <label className="mb-1.5 block text-xs font-semibold text-neutral-600">Team</label>
              <div className="flex flex-wrap gap-2">
                {teams.map((t) => {
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
              <input type="hidden" name="ownerTeamId" value={ownerTeamId ?? ""} />
            </div>

            {products.length > 0 && (
              <div className="mb-5">
                <label className="mb-1.5 block text-xs font-semibold text-neutral-600">Product</label>
                <div className="flex flex-wrap gap-2">
                  {products.map((p) => {
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
                <input type="hidden" name="productIds" value={JSON.stringify(productIds)} />
              </div>
            )}

            <div className="mb-5">
              <label className="mb-1.5 block text-xs font-semibold text-neutral-600">Tags</label>
              {availableCategories.length === 0 ? (
                <p className="text-xs text-neutral-400">
                  {ownerTeamId || productIds.length > 0
                    ? 'No tags set up here yet — this will be filed under "Others".'
                    : "Pick a team or product above to see its tags."}
                </p>
              ) : (
                <>
                  {availableCategories.length > 8 && (
                    <div className="relative mb-2">
                      <Icon
                        name="Interface/Search_Magnifying_Glass"
                        size={13}
                        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400"
                      />
                      <input
                        type="text"
                        value={tagQuery}
                        onChange={(e) => setTagQuery(e.target.value)}
                        placeholder="Find a tag"
                        className="w-full rounded-md border border-neutral-200 py-1.5 pr-3 pl-8 text-xs text-neutral-700 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none"
                      />
                    </div>
                  )}
                  <div className="flex max-h-36 flex-wrap gap-2 overflow-y-auto">
                    {filteredCategories.length === 0 && (
                      <p className="text-xs text-neutral-400 italic">No matching tags</p>
                    )}
                    {filteredCategories.map((c) => {
                      const selected = c.memberIds.some((id) => selectedCategoryIds.includes(id));
                      const color = colorForCategory(c);
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
              <input type="hidden" name="categoryIds" value={JSON.stringify(selectedCategoryIds)} />
            </div>

            <input type="hidden" name="sourceType" value={sourceType} />

            <div className="mb-4">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-neutral-600">
                <Icon name="File/Folder" size={14} style={{ color: "#8a8a8a" }} />
                Upload a file
              </label>
              <input
                ref={fileInputRef}
                type="file"
                name="file"
                onChange={onFileChange}
                className="w-full rounded-md border border-dashed border-neutral-300 px-3 py-4 text-sm text-neutral-600"
              />
            </div>

            <div className="mb-2 flex items-center gap-3 text-xs font-medium text-neutral-400">
              <div className="h-px flex-1 bg-neutral-200" />
              or
              <div className="h-px flex-1 bg-neutral-200" />
            </div>

            <div className="mb-5">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-neutral-600">
                <Icon name="Interface/Link" size={14} style={{ color: "#8a8a8a" }} />
                Link an existing doc
              </label>
              <input
                ref={linkTitleRef}
                name="title"
                placeholder="Title"
                onChange={onLinkChange}
                className="mb-2 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
              />
              <input
                ref={linkUrlRef}
                type="url"
                name="externalUrl"
                placeholder="https://docs.google.com/document/d/…"
                onChange={onLinkChange}
                className="w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
              />
              <p className="mt-1.5 text-xs text-neutral-400">
                Set the Drive share to viewer-only so it stays view-only once linked here.
              </p>
            </div>

            {error && <p className="mb-3 text-xs font-medium text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md py-2.5 text-sm font-semibold text-white transition-opacity disabled:opacity-60"
              style={{ background: "var(--brand-purple)" }}
            >
              {submitting ? "Uploading…" : "Submit"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

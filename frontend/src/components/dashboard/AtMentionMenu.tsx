"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { searchDocumentsForEmbedAction, getTagCatalogAction } from "@/app/dashboard/documents-actions";
import type { DocumentSummary, Team, Product, Category } from "@/lib/api";
import { FileTypeIcon } from "@/components/dashboard/FileTypeIcon";
import { Icon } from "@/components/dashboard/Icon";
import { fileTypeOf } from "@/lib/file-type";
import { Tag } from "@/components/dashboard/Tag";
import { colorForCategory, dedupeGlobalCategories, TEAM_TAG_COLOR, PRODUCT_TAG_COLOR } from "@/lib/tag-colors";

export interface AtMentionPerson {
  id: string;
  label: string;
}

// What gets handed back to RichTextEditor.tsx's suggestion `command` — it
// branches on `kind` to insert either a mention node or a documentEmbed node
// (see buildAtMenuSuggestion there).
export type AtMenuSelection = { kind: "person"; id: string; label: string } | { kind: "document"; id: string };

type Catalog = { teams: Team[]; products: Product[]; categoriesByScope: Record<string, Category[]> };

type View =
  | { name: "root" }
  | { name: "entities"; entityMode: "team" | "product" }
  | { name: "categories"; entityMode: "team" | "product"; entityId: string; entityName: string }
  | {
      name: "docs";
      entityMode?: "team" | "product";
      entityId?: string;
      categoryId?: string;
      label: string;
    };

const DEBOUNCE_MS = 200;

// Combined "@" menu — Notion's own trigger mentions people *and* links to a
// page from one dropdown (see the reference screenshot); our equivalent of
// "a page" is a portal document, which (unlike a Notion page) carries
// Team/Product/Category tags, so referencing one needs either a direct title
// search or a browse-by-tag drill-down, not just a flat recent-pages list.
export const AtMentionMenu = forwardRef<
  { onKeyDown: (props: { event: KeyboardEvent }) => boolean },
  { people: AtMentionPerson[]; query: string; command: (item: AtMenuSelection) => void }
>(function AtMentionMenu({ people, query, command }, ref) {
  const [view, setView] = useState<View>({ name: "root" });
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null);
  const [docsLoading, setDocsLoading] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getTagCatalogAction().then(setCatalog);
  }, []);

  // Root view's document search is a live backend title search, debounced —
  // there's no fixed list to filter client-side the way browse views have.
  useEffect(() => {
    if (view.name !== "root") return;
    if (!query.trim()) {
      setDocs(null);
      return;
    }
    setDocsLoading(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchDocumentsForEmbedAction({ q: query.trim() }).then((results) => {
        setDocs(results);
        setDocsLoading(false);
      });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [view, query]);

  // A browse view's doc list is fetched once per entity/category (not on
  // every keystroke) — the query still narrows it, but client-side against
  // whatever's already loaded, same as filtering the team/category rows.
  const docsViewKey = view.name === "docs" ? `${view.entityMode ?? ""}:${view.entityId ?? ""}:${view.categoryId ?? ""}` : null;
  useEffect(() => {
    if (view.name !== "docs") return;
    setDocsLoading(true);
    searchDocumentsForEmbedAction({ mode: view.entityMode, entityId: view.entityId, category: view.categoryId }).then(
      (results) => {
        setDocs(results);
        setDocsLoading(false);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docsViewKey]);

  function goTo(next: View) {
    setDocs(null);
    setView(next);
  }

  const needle = query.trim().toLowerCase();

  // --- Build the flat, keyboard-navigable row list for the current view ---
  type Row = { key: string; content: React.ReactNode; onActivate: () => void };
  const rows: Row[] = [];
  const sections: { heading: string; rows: Row[] }[] = [];

  if (view.name === "root") {
    if (people.length > 0) {
      sections.push({
        heading: "People",
        rows: people.map((p) => ({
          key: `person:${p.id}`,
          content: <PersonRow name={p.label} isAll={p.id === "all"} />,
          onActivate: () => command({ kind: "person", id: p.id, label: p.label }),
        })),
      });
    }

    const docRows: Row[] = [];
    if (!needle) {
      docRows.push({
        key: "browse:team",
        content: <ActionRow label="Browse by Team" />,
        onActivate: () => goTo({ name: "entities", entityMode: "team" }),
      });
      docRows.push({
        key: "browse:product",
        content: <ActionRow label="Browse by Product" />,
        onActivate: () => goTo({ name: "entities", entityMode: "product" }),
      });
    } else if (docsLoading) {
      docRows.push({ key: "loading", content: <MutedRow label="Searching…" />, onActivate: () => {} });
    } else if (docs && docs.length === 0) {
      docRows.push({ key: "empty", content: <MutedRow label="No documents match" />, onActivate: () => {} });
    } else if (docs) {
      for (const doc of docs.slice(0, 6)) {
        docRows.push({
          key: `doc:${doc.id}`,
          content: <DocRow doc={doc} />,
          onActivate: () => command({ kind: "document", id: doc.id }),
        });
      }
    }
    sections.push({ heading: "Documents", rows: docRows });
  } else if (view.name === "entities") {
    const back: Row = { key: "back", content: <BackRow />, onActivate: () => goTo({ name: "root" }) };
    const entities = view.entityMode === "team" ? (catalog?.teams ?? []) : (catalog?.products ?? []);
    const filtered = needle ? entities.filter((e) => e.name.toLowerCase().includes(needle)) : entities;
    sections.push({
      heading: view.entityMode === "team" ? "Teams" : "Products",
      rows: [
        back,
        ...(catalog === null
          ? [{ key: "loading", content: <MutedRow label="Loading…" />, onActivate: () => {} }]
          : filtered.map((e) => ({
              key: `entity:${e.id}`,
              content: <EntityRow name={e.name} count={e.documentCount} />,
              onActivate: () =>
                goTo({ name: "categories", entityMode: view.entityMode, entityId: e.id, entityName: e.name }),
            }))),
      ],
    });
  } else if (view.name === "categories") {
    const back: Row = {
      key: "back",
      content: <BackRow />,
      onActivate: () => goTo({ name: "entities", entityMode: view.entityMode }),
    };
    const allDocs: Row = {
      key: "all",
      content: <ActionRow label={`All ${view.entityName} documents`} />,
      onActivate: () => goTo({ name: "docs", entityMode: view.entityMode, entityId: view.entityId, label: view.entityName }),
    };
    const categories = catalog?.categoriesByScope[view.entityId] ?? [];
    const filtered = needle ? categories.filter((c) => c.name.toLowerCase().includes(needle)) : categories;
    sections.push({
      heading: view.entityName,
      rows: [
        back,
        allDocs,
        ...filtered.map((c) => ({
          key: `category:${c.id}`,
          content: <EntityRow name={c.name} count={c.documentCount} />,
          onActivate: () =>
            goTo({
              name: "docs",
              entityMode: view.entityMode,
              entityId: view.entityId,
              categoryId: c.id,
              label: `${view.entityName} · ${c.name}`,
            }),
        })),
      ],
    });
  } else if (view.name === "docs") {
    // "docs" is only ever reached from "categories" (see the "All …
    // documents" / per-category rows above), so entityMode/entityId are
    // always set here even though the View type leaves them optional.
    const { entityMode, entityId } = view;
    const back: Row = {
      key: "back",
      content: <BackRow />,
      onActivate: () => {
        if (!entityMode || !entityId) {
          goTo({ name: "root" });
          return;
        }
        const entities = entityMode === "team" ? catalog?.teams : catalog?.products;
        const entityName = entities?.find((e) => e.id === entityId)?.name ?? view.label;
        goTo({ name: "categories", entityMode, entityId, entityName });
      },
    };
    const filteredDocs = (docs ?? []).filter((d) => !needle || d.title.toLowerCase().includes(needle));
    const docRows: Row[] = docsLoading
      ? [{ key: "loading", content: <MutedRow label="Loading…" />, onActivate: () => {} }]
      : filteredDocs.length === 0
        ? [{ key: "empty", content: <MutedRow label="No documents" />, onActivate: () => {} }]
        : filteredDocs.map((doc) => ({
            key: `doc:${doc.id}`,
            content: <DocRow doc={doc} />,
            onActivate: () => command({ kind: "document", id: doc.id }),
          }));
    sections.push({ heading: view.label, rows: [back, ...docRows] });
  }

  for (const section of sections) rows.push(...section.rows);

  const rawIndex = rows.findIndex((r) => r.key === selectedKey);
  const selectedIndex = rawIndex === -1 ? 0 : rawIndex;

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }) {
      if (event.key === "ArrowDown") {
        const next = rows[(selectedIndex + 1) % rows.length];
        if (next) setSelectedKey(next.key);
        return true;
      }
      if (event.key === "ArrowUp") {
        const next = rows[(selectedIndex - 1 + rows.length) % rows.length];
        if (next) setSelectedKey(next.key);
        return true;
      }
      if (event.key === "Enter") {
        rows[selectedIndex]?.onActivate();
        return true;
      }
      return false;
    },
  }));

  if (rows.length === 0) {
    return <div className="rounded-md border border-neutral-200 bg-white px-3 py-2 text-xs text-neutral-400 shadow-lg dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-500">No matches</div>;
  }

  return (
    <div className="max-h-80 w-72 overflow-y-auto rounded-md border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
      {sections.map(
        (section, si) =>
          section.rows.length > 0 && (
            <div key={section.heading} className={si > 0 ? "mt-1 border-t border-neutral-100 pt-1 dark:border-neutral-800" : undefined}>
              <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-500">{section.heading}</p>
              {section.rows.map((row) => (
                <button
                  key={row.key}
                  type="button"
                  onClick={row.onActivate}
                  className="block w-full px-3 py-1.5 text-left"
                  style={row.key === rows[selectedIndex]?.key ? { background: "var(--brand-purple-tint)" } : undefined}
                >
                  {row.content}
                </button>
              ))}
            </div>
          ),
      )}
    </div>
  );
});

// isAll marks the reserved "All members" row (id "all", see
// TeamNoteEditor.tsx) — a group icon instead of an initial so it doesn't
// read as an actual person named "All".
function PersonRow({ name, isAll }: { name: string; isAll?: boolean }) {
  return (
    <span className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
        style={{ background: "var(--brand-purple)" }}
      >
        {isAll ? <Icon name="User/Users_Group" size={11} /> : name.trim().charAt(0).toUpperCase() || "?"}
      </span>
      <span className="truncate">{name}</span>
    </span>
  );
}

function ActionRow({ label }: { label: string }) {
  return (
    <span className="flex items-center justify-between text-sm text-neutral-700 dark:text-neutral-300">
      {label}
      <Icon name="Arrow/Chevron_Right" size={12} className="shrink-0" />
    </span>
  );
}

function EntityRow({ name, count }: { name: string; count: number }) {
  return (
    <span className="flex items-center justify-between text-sm text-neutral-700 dark:text-neutral-300">
      <span className="truncate">{name}</span>
      <span className="ml-2 flex shrink-0 items-center gap-1 text-xs text-neutral-400 dark:text-neutral-500">
        {count}
        <Icon name="Arrow/Chevron_Right" size={12} className="shrink-0" />
      </span>
    </span>
  );
}

function MutedRow({ label }: { label: string }) {
  return <span className="text-sm text-neutral-400 italic dark:text-neutral-500">{label}</span>;
}

function BackRow() {
  return (
    <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-500 dark:text-neutral-400">
      <Icon name="Arrow/Chevron_Left" size={12} className="shrink-0" />
      Back
    </span>
  );
}

function DocRow({ doc }: { doc: DocumentSummary }) {
  return (
    <span className="flex items-center gap-2">
      <FileTypeIcon type={fileTypeOf(doc.title, doc.sourceType)} externalUrl={doc.externalUrl} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-neutral-700 dark:text-neutral-300">{doc.title}</span>
        {(doc.ownerTeam || doc.products.length > 0 || doc.categories.length > 0) && (
          <span className="mt-0.5 flex flex-wrap gap-1">
            {doc.ownerTeam && <Tag label={doc.ownerTeam.name} bg={TEAM_TAG_COLOR.bg} fg={TEAM_TAG_COLOR.fg} />}
            {doc.products.map((p) => (
              <Tag key={p.id} label={p.name} bg={PRODUCT_TAG_COLOR.bg} fg={PRODUCT_TAG_COLOR.fg} />
            ))}
            {dedupeGlobalCategories(doc.categories).map((c) => {
              const color = colorForCategory(c);
              return <Tag key={c.id} label={c.name} bg={color.bg} fg={color.fg} />;
            })}
          </span>
        )}
      </span>
    </span>
  );
}

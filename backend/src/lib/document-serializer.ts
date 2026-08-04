import { prisma } from "./prisma.js";
import { Prisma } from "../generated/prisma/client.js";

// Declared separately (rather than inline in documentInclude below) so it
// keeps its own mutable-array type — documentInclude's `as const` would
// otherwise freeze this into a readonly tuple, which Prisma's generated
// input types don't accept for orderBy.
const categoryOrderBy: Prisma.DocumentCategoryOrderByWithRelationInput[] = [
  { category: { isGlobal: "desc" } },
  { category: { name: "asc" } },
];

export const documentInclude = {
  ownerTeam: { select: { id: true, name: true } },
  // Global tags first, alphabetical within each group — matches the order
  // GET /api/categories returns for a scope (see routes/categories.ts), so
  // a document's own tag chips (DocumentRow, DocumentsCardGrid, search
  // results, recycle bin) aren't left in arbitrary join-row insertion order.
  categories: {
    include: { category: { select: { id: true, name: true, scope: true, isGlobal: true } } },
    orderBy: categoryOrderBy,
  },
  uploadedBy: { select: { id: true, name: true, email: true } },
  products: { include: { product: { select: { id: true, name: true } } } },
} as const;

// Shared "still fresh" window for both the recently-approved dot and the
// recently-deleted dot/strikethrough — also used as the deletedAt cutoff in
// documents.ts's mergeRecent query, so both sides of "how long does this
// stay flagged" agree with a single source of truth.
export const RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;

export function serializeDocument(
  doc: {
    id: string;
    status: string;
    publishedAt: Date | null;
    deletedAt: Date | null;
    products: { product: { id: string; name: string } }[];
    categories: { category: { id: string; name: string; scope: string; isGlobal: boolean } }[];
    [key: string]: unknown;
  },
  pinnedIds?: ReadonlySet<string>,
) {
  const { products, categories, publishedAt, deletedAt, ...rest } = doc;
  // Computed here (server has "now" at request time) rather than on the
  // client — comparing against Date.now() during React render is an impure
  // read that can produce stale/inconsistent results across re-renders.
  const recentlyPublished =
    doc.status === "PUBLISHED" && publishedAt !== null
      ? Date.now() - publishedAt.getTime() < RECENT_WINDOW_MS
      : false;
  const recentlyDeleted = deletedAt !== null && Date.now() - deletedAt.getTime() < RECENT_WINDOW_MS;
  return {
    ...rest,
    deletedAt,
    products: products.map((p) => p.product),
    categories: categories.map((c) => c.category),
    pinned: pinnedIds?.has(doc.id) ?? false,
    recentlyPublished,
    recentlyDeleted,
  };
}

// Looks up which of a batch of document ids the given user has pinned —
// one query per list response rather than a per-row join, since pins are
// sparse relative to the documents being listed.
export async function loadPinnedIds(userId: string, documentIds: string[]): Promise<Set<string>> {
  if (documentIds.length === 0) return new Set();
  const rows = await prisma.pinnedDocument.findMany({
    where: { userId, documentId: { in: documentIds } },
    select: { documentId: true },
  });
  return new Set(rows.map((r) => r.documentId));
}

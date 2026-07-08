import { prisma } from "./prisma.js";

export const documentInclude = {
  ownerTeam: { select: { id: true, name: true } },
  categories: { include: { category: { select: { id: true, name: true, scope: true } } } },
  uploadedBy: { select: { id: true, name: true, email: true } },
  products: { include: { product: { select: { id: true, name: true } } } },
} as const;

const RECENTLY_PUBLISHED_WINDOW_MS = 48 * 60 * 60 * 1000;

export function serializeDocument(
  doc: {
    id: string;
    status: string;
    publishedAt: Date | null;
    products: { product: { id: string; name: string } }[];
    categories: { category: { id: string; name: string; scope: string } }[];
    [key: string]: unknown;
  },
  pinnedIds?: ReadonlySet<string>,
) {
  const { products, categories, publishedAt, ...rest } = doc;
  // Computed here (server has "now" at request time) rather than on the
  // client — comparing against Date.now() during React render is an impure
  // read that can produce stale/inconsistent results across re-renders.
  const recentlyPublished =
    doc.status === "PUBLISHED" && publishedAt !== null
      ? Date.now() - publishedAt.getTime() < RECENTLY_PUBLISHED_WINDOW_MS
      : false;
  return {
    ...rest,
    products: products.map((p) => p.product),
    categories: categories.map((c) => c.category),
    pinned: pinnedIds?.has(doc.id) ?? false,
    recentlyPublished,
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

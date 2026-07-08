import Link from "next/link";
import type { Category, DocumentSummary } from "@/lib/api";
import { colorForScope } from "@/lib/tag-colors";

export function FolderGrid({
  categories,
  documents,
  baseHref,
}: {
  categories: Category[];
  documents: DocumentSummary[];
  baseHref: string;
}) {
  // A folder with nothing matching the active filters (e.g. a type=pdf
  // filter with no PDFs in that category) isn't worth showing as a tile —
  // it'd just be an empty, useless click.
  const nonEmpty = categories
    .map((c) => ({ category: c, count: documents.filter((d) => d.categories.some((dc) => dc.id === c.id)).length }))
    .filter((entry) => entry.count > 0);

  if (nonEmpty.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <FolderIcon size={36} color="#c9c2ce" />
        <p className="text-sm font-medium text-neutral-600">No category folders here yet</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {nonEmpty.map(({ category: c, count }) => {
        const color = colorForScope(c.scope);
        return (
          <Link
            key={c.id}
            href={`${baseHref}&category=${c.id}`}
            className="flex flex-col items-start gap-2 rounded-lg border border-neutral-200 p-4 transition-colors hover:border-neutral-300 hover:shadow-sm"
          >
            <FolderIcon size={28} color={color.fg} />
            <div>
              <p className="text-sm font-medium text-neutral-800">{c.name}</p>
              <p className="text-xs text-neutral-400">{count} document{count === 1 ? "" : "s"}</p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}

function FolderIcon({ size, color }: { size: number; color: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden style={{ color }}>
      <path
        d="M3.5 6.5A1.5 1.5 0 0 1 5 5h4.5l2 2.5H19a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5v-9Z"
        fill={color}
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

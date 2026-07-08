import type { DocumentSummary } from "@/lib/api";

const DOT_COLOR: Record<"PENDING" | "REJECTED" | "PUBLISHED", string> = {
  PENDING: "#c9931a",
  REJECTED: "#b3342c",
  PUBLISHED: "#2e7d3f",
};

// A small at-a-glance indicator, separate from the full "Pending"/"Rejected"
// text pill (STATUS_STYLE in DocumentRow/DocumentsCardGrid) — this shows even
// in views that don't render that pill, e.g. a User's own pending upload
// sitting in their normal browse list. Published only shows a dot while
// `recentlyPublished` (computed server-side — see document-serializer.ts) is
// true; after that window it's the default state and doesn't need a marker.
export function StatusDot({
  status,
  recentlyPublished,
}: {
  status: DocumentSummary["status"];
  recentlyPublished: boolean;
}) {
  if (status === "PENDING") return <Dot color={DOT_COLOR.PENDING} title="Pending review" />;
  if (status === "REJECTED") return <Dot color={DOT_COLOR.REJECTED} title="Rejected" />;
  if (status === "PUBLISHED" && recentlyPublished) {
    return <Dot color={DOT_COLOR.PUBLISHED} title="Recently approved" />;
  }
  return null;
}

function Dot({ color, title }: { color: string; title: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className="inline-block h-1.5 w-1.5 shrink-0 rounded-full"
      style={{ background: color }}
    />
  );
}

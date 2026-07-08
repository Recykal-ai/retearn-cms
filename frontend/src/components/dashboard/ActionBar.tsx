import type { Team, Product, Category } from "@/lib/api";
import { UploadModal } from "@/components/dashboard/UploadModal";
import { ApprovalsNavLink } from "@/components/dashboard/ApprovalsNavLink";
import { uploadDocumentAction } from "@/app/dashboard/documents-actions";

export function ActionBar({
  teams,
  products,
  categoriesByScope,
  isAdmin,
}: {
  teams: Team[];
  products: Product[];
  categoriesByScope: Record<string, Category[]>;
  isAdmin: boolean;
}) {
  return (
    <div
      className="flex h-11 flex-shrink-0 items-center gap-6 border-b px-6"
      style={{ fontFamily: "var(--font-ui)", background: "var(--canvas)", borderColor: "var(--canvas-border)" }}
    >
      <UploadModal
        teams={teams}
        products={products}
        categoriesByScope={categoriesByScope}
        action={uploadDocumentAction}
      />
      <ApprovalsNavLink isAdmin={isAdmin} />
    </div>
  );
}

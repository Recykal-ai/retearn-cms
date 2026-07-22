import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getTeams, getProducts, getCategories, type Category } from "@/lib/api";
import { SubPageTopBar } from "@/components/dashboard/SubPageTopBar";
import { NotesPageContent } from "@/components/dashboard/NotesPageContent";

export default async function NotesPage() {
  const session = await auth();
  if (!session) {
    redirect("/");
  }
  if (!session.appToken) {
    redirect("/dashboard");
  }

  const isAdmin = session.role === "ADMIN" || session.role === "SUPER_ADMIN";

  // Same team/product/category fan-out dashboard/page.tsx uses for its own
  // UploadModal — needed here too now that a note can be exported straight
  // into an upload via the same modal (see NotesPageContent's export flow).
  const appToken = session.appToken;
  const [teams, products] = await Promise.all([getTeams(appToken), getProducts(appToken)]);
  const allEntities = [...teams, ...products];
  const categoryLists = await Promise.all(allEntities.map((e) => getCategories(appToken, e.id)));
  const categoriesByScope: Record<string, Category[]> = {};
  allEntities.forEach((e, i) => {
    categoriesByScope[e.id] = categoryLists[i];
  });

  return (
    <div className="flex h-screen flex-col" style={{ fontFamily: "var(--font-ui)", background: "var(--canvas)" }}>
      <SubPageTopBar />

      {/* Full-bleed master-detail layout — a centered narrow card (like
          Approvals/Admin use) would leave the note editor too cramped. */}
      <div className="min-h-0 flex-1">
        <Suspense fallback={null}>
          <NotesPageContent
            isAdmin={isAdmin}
            currentUserId={session.appUserId!}
            teams={teams}
            products={products}
            categoriesByScope={categoriesByScope}
          />
        </Suspense>
      </div>
    </div>
  );
}

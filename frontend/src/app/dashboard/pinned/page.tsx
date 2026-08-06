import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getPinnedDocuments, getTeams, getProducts } from "@/lib/api";
import { withSessionGuard } from "@/lib/session-guard";
import { SubPageTopBar } from "@/components/dashboard/SubPageTopBar";
import { PinnedPageContent } from "@/components/dashboard/PinnedPageContent";

export default async function PinnedPage() {
  const session = await auth();
  if (!session) {
    redirect("/");
  }
  if (!session.appToken) {
    redirect("/");
  }

  const appToken = session.appToken;
  const { pinnedDocs, teams, products } = await withSessionGuard(async () => {
    const [pinnedDocs, teams, products] = await Promise.all([
      getPinnedDocuments(appToken),
      getTeams(appToken),
      getProducts(appToken),
    ]);
    return { pinnedDocs, teams, products };
  });

  return (
    <div className="flex h-screen flex-col" style={{ fontFamily: "var(--font-ui)", background: "var(--canvas)" }}>
      <SubPageTopBar />

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-5xl rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          <div className="mb-5">
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-200">Pinned</h1>
            <p className="text-sm text-neutral-400 dark:text-neutral-500">Documents you&apos;ve pinned for quick access.</p>
          </div>
          {pinnedDocs.length === 0 ? (
            <p className="py-16 text-center text-sm text-neutral-400 dark:text-neutral-500">Nothing pinned yet.</p>
          ) : (
            <PinnedPageContent documents={pinnedDocs} teams={teams} products={products} />
          )}
        </div>
      </div>
    </div>
  );
}

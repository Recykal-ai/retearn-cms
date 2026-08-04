import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDeletedDocuments, getTeams, getProducts } from "@/lib/api";
import { withSessionGuard } from "@/lib/session-guard";
import { SubPageTopBar } from "@/components/dashboard/SubPageTopBar";
import { RecycleBinList } from "@/components/dashboard/RecycleBinList";

export default async function RecycleBinPage() {
  const session = await auth();
  if (!session) {
    redirect("/");
  }
  if (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
    redirect("/dashboard");
  }
  if (!session.appToken) {
    redirect("/");
  }

  const appToken = session.appToken;
  const { deletedDocs, teams, products } = await withSessionGuard(async () => {
    const [deletedDocs, teams, products] = await Promise.all([
      getDeletedDocuments(appToken),
      getTeams(appToken),
      getProducts(appToken),
    ]);
    return { deletedDocs, teams, products };
  });

  return (
    <div className="flex h-screen flex-col" style={{ fontFamily: "var(--font-ui)", background: "var(--canvas)" }}>
      <SubPageTopBar />

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-4xl rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 px-6 py-4">
            <h1 className="text-lg font-semibold text-neutral-900">Recycle Bin</h1>
            <p className="text-sm text-neutral-400">Deleted documents can be recovered here.</p>
          </div>
          <RecycleBinList documents={deletedDocs} teams={teams} products={products} />
        </div>
      </div>
    </div>
  );
}

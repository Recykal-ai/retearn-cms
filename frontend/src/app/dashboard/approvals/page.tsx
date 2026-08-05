import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDocuments, getDeletionRequests, getTeams, getProducts, getMyDocuments } from "@/lib/api";
import { withSessionGuard } from "@/lib/session-guard";
import { ApprovalsAdmin } from "@/components/dashboard/ApprovalsAdmin";
import { DeletionRequestsAdmin } from "@/components/dashboard/DeletionRequestsAdmin";
import { MyUploadsTable } from "@/components/dashboard/MyUploadsTable";
import { SubPageTopBar } from "@/components/dashboard/SubPageTopBar";
import { ApprovalsNav, type ApprovalsTab } from "@/components/dashboard/ApprovalsNav";

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await auth();
  if (!session) {
    redirect("/");
  }
  if (!session.appToken) {
    redirect("/dashboard");
  }

  const isAdmin = session.role === "ADMIN" || session.role === "SUPER_ADMIN";
  const { tab } = await searchParams;
  const activeTab: ApprovalsTab = tab === "deletions" ? "deletions" : "approvals";

  return (
    <div className="flex h-screen flex-col" style={{ fontFamily: "var(--font-ui)", background: "var(--canvas)" }}>
      <SubPageTopBar />

      {isAdmin ? (
        <AdminQueue appToken={session.appToken} activeTab={activeTab} />
      ) : (
        <div className="flex-1 overflow-y-auto p-8">
          <div className="mx-auto max-w-4xl rounded-lg border border-neutral-200 bg-white shadow-sm">
            <div className="border-b border-neutral-100 px-6 py-4">
              <h1 className="text-lg font-semibold text-neutral-900">Approvals</h1>
              <p className="text-sm text-neutral-400">Status of documents you&apos;ve submitted or asked to delete</p>
            </div>
            <UserSubmissions appToken={session.appToken} />
          </div>
        </div>
      )}
    </div>
  );
}

async function AdminQueue({ appToken, activeTab }: { appToken: string; activeTab: ApprovalsTab }) {
  const { pending, deletionRequests, teams, products } = await withSessionGuard(async () => {
    const [pending, deletionRequests, teams, products] = await Promise.all([
      getDocuments(appToken, { status: "PENDING" }),
      getDeletionRequests(appToken),
      getTeams(appToken),
      getProducts(appToken),
    ]);
    return { pending, deletionRequests, teams, products };
  });

  return (
    <div className="flex flex-1 overflow-hidden">
      <ApprovalsNav activeTab={activeTab} pendingCount={pending.length} deletionCount={deletionRequests.length} />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 px-6 py-4">
            <h1 className="text-lg font-semibold text-neutral-900">
              {activeTab === "approvals" ? "Approval requests" : "Deletion requests"}
            </h1>
            <p className="text-sm text-neutral-400">
              {activeTab === "approvals" ? "Documents waiting on your review" : "Someone has asked for these to be removed"}
            </p>
          </div>

          {activeTab === "approvals" ? (
            <ApprovalsAdmin documents={pending} teams={teams} products={products} />
          ) : (
            <DeletionRequestsAdmin documents={deletionRequests} teams={teams} products={products} />
          )}
        </div>
      </main>
    </div>
  );
}

async function UserSubmissions({ appToken }: { appToken: string }) {
  // GET /mine already scopes to "uploaded by me OR I requested its deletion
  // (live or historical)" server-side, including soft-deleted docs — see
  // documents.ts.
  const mine = await withSessionGuard(() => getMyDocuments(appToken));

  if (mine.length === 0) {
    return <p className="py-16 text-center text-sm text-neutral-400">You haven&apos;t submitted anything yet.</p>;
  }

  return <MyUploadsTable documents={mine} />;
}

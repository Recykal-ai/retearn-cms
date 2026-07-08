import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDocuments, getDeletionRequests, type DocStatus } from "@/lib/api";
import { withSessionGuard } from "@/lib/session-guard";
import { ApprovalsAdmin } from "@/components/dashboard/ApprovalsAdmin";
import { DeletionRequestsAdmin } from "@/components/dashboard/DeletionRequestsAdmin";
import { MyUploadsTable } from "@/components/dashboard/MyUploadsTable";
import { CloseButton } from "@/components/dashboard/CloseButton";

export default async function ApprovalsPage() {
  const session = await auth();
  if (!session) {
    redirect("/");
  }
  if (!session.appToken) {
    redirect("/dashboard");
  }

  const isAdmin = session.role === "ADMIN" || session.role === "SUPER_ADMIN";

  return (
    <div className="flex h-screen flex-col" style={{ fontFamily: "var(--font-ui)", background: "var(--canvas)" }}>
      <div
        className="flex h-15 flex-shrink-0 items-center justify-between px-6 shadow-sm"
        style={{ background: "linear-gradient(180deg, var(--brand-purple) 0%, var(--brand-purple-dark) 100%)" }}
      >
        <Image
          src="/retearn-logo.png"
          alt="Retearn"
          width={623}
          height={207}
          priority
          className="h-8 w-auto"
          style={{ filter: "brightness(0) invert(1)" }}
        />
        <CloseButton href="/dashboard" />
      </div>

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-4xl rounded-lg border border-neutral-200 bg-white shadow-sm">
          <div className="border-b border-neutral-100 px-6 py-4">
            <h1 className="text-lg font-semibold text-neutral-900">Approvals</h1>
            <p className="text-sm text-neutral-400">
              {isAdmin ? "Documents waiting on your review" : "Status of documents you've submitted"}
            </p>
          </div>

          {isAdmin ? (
            <AdminQueue appToken={session.appToken} />
          ) : (
            <UserSubmissions appToken={session.appToken} userId={session.appUserId ?? ""} />
          )}
        </div>
      </div>
    </div>
  );
}

async function AdminQueue({ appToken }: { appToken: string }) {
  const [pending, deletionRequests] = await withSessionGuard(() =>
    Promise.all([getDocuments(appToken, { status: "PENDING" }), getDeletionRequests(appToken)]),
  );
  return (
    <div>
      <ApprovalsAdmin documents={pending} />
      <div className="border-t border-neutral-100 px-6 py-4">
        <h2 className="text-sm font-semibold text-neutral-900">Deletion requests</h2>
        <p className="text-xs text-neutral-400">Someone has asked for these to be removed</p>
      </div>
      <DeletionRequestsAdmin documents={deletionRequests} />
    </div>
  );
}

async function UserSubmissions({ appToken, userId }: { appToken: string; userId: string }) {
  const statuses: DocStatus[] = ["PENDING", "REJECTED", "PUBLISHED"];
  const mine = await withSessionGuard(async () => {
    const lists = await Promise.all(statuses.map((status) => getDocuments(appToken, { status })));
    return lists
      .flat()
      .filter((doc) => doc.uploadedBy.id === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  });

  if (mine.length === 0) {
    return <p className="py-16 text-center text-sm text-neutral-400">You haven&apos;t submitted anything yet.</p>;
  }

  return <MyUploadsTable documents={mine} />;
}

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getRecentDocuments } from "@/lib/api";
import { withSessionGuard } from "@/lib/session-guard";
import { SubPageTopBar } from "@/components/dashboard/SubPageTopBar";
import { SimpleDocumentsTable } from "@/components/dashboard/SimpleDocumentsTable";

export default async function RecentPage() {
  const session = await auth();
  if (!session) {
    redirect("/");
  }
  if (!session.appToken) {
    redirect("/");
  }

  const appToken = session.appToken;
  // Deliberately small — "Recent" means the actual last-touched handful,
  // not the user's entire viewing history back to day one. Same 10 the old
  // sidebar popup showed; only the page/layout around it changed. Capped
  // this low, a filter drawer over the results isn't worth the UI — the
  // list is short enough to just scan (SimpleDocumentsTable still has its
  // own search box for the rare case of finding one by name).
  const recentDocs = await withSessionGuard(() => getRecentDocuments(appToken, 10));

  return (
    <div className="flex h-screen flex-col" style={{ fontFamily: "var(--font-ui)", background: "var(--canvas)" }}>
      <SubPageTopBar />

      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-5xl rounded-lg border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          <div className="mb-5">
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-200">Recent</h1>
            <p className="text-sm text-neutral-400 dark:text-neutral-500">Documents you&apos;ve recently viewed or edited.</p>
          </div>
          {recentDocs.length === 0 ? (
            <p className="py-16 text-center text-sm text-neutral-400 dark:text-neutral-500">Nothing viewed recently.</p>
          ) : (
            <SimpleDocumentsTable documents={recentDocs} entityName="Recent" />
          )}
        </div>
      </div>
    </div>
  );
}

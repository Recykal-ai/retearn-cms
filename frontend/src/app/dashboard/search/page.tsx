import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { searchDocuments } from "@/lib/api";
import { withSessionGuard } from "@/lib/session-guard";
import { TopBar } from "@/components/dashboard/TopBar";
import { SearchResultsTable } from "@/components/dashboard/SearchResultsTable";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await auth();
  if (!session) redirect("/");
  if (!session.appToken) redirect("/");

  const { q } = await searchParams;
  const appToken = session.appToken;
  const results = q ? await withSessionGuard(() => searchDocuments(appToken, q)) : [];

  return (
    <div className="flex h-screen flex-col" style={{ background: "var(--canvas)" }}>
      <TopBar query={q} />
      <div className="flex-1 overflow-y-auto p-8" style={{ fontFamily: "var(--font-ui)" }}>
        <div className="mx-auto max-w-4xl rounded-lg border border-neutral-200 bg-white shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex items-center justify-between border-b border-neutral-100 px-6 py-4 dark:border-neutral-800">
            <div>
              <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-200">Search results</h1>
              {q && <p className="text-sm text-neutral-400 dark:text-neutral-500">{results.length} result(s) for &ldquo;{q}&rdquo;</p>}
            </div>
            <Link href="/dashboard" className="text-sm font-medium" style={{ color: "var(--brand-purple)" }}>
              ← Back to dashboard
            </Link>
          </div>

          {!q ? (
            <p className="py-16 text-center text-sm text-neutral-400 dark:text-neutral-500">Type something in the search bar above.</p>
          ) : results.length === 0 ? (
            <p className="py-16 text-center text-sm text-neutral-400 dark:text-neutral-500">No published documents match &ldquo;{q}&rdquo;.</p>
          ) : (
            <SearchResultsTable
              documents={results}
              isAdmin={session.role === "ADMIN" || session.role === "SUPER_ADMIN"}
              currentUserId={session.appUserId}
            />
          )}
        </div>
      </div>
    </div>
  );
}

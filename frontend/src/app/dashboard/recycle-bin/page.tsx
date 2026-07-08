import Image from "next/image";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getDeletedDocuments } from "@/lib/api";
import { withSessionGuard } from "@/lib/session-guard";
import { CloseButton } from "@/components/dashboard/CloseButton";
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
  const deletedDocs = await withSessionGuard(() => getDeletedDocuments(appToken));

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
            <h1 className="text-lg font-semibold text-neutral-900">Recycle Bin</h1>
            <p className="text-sm text-neutral-400">Deleted documents can be recovered here.</p>
          </div>
          <RecycleBinList documents={deletedDocs} />
        </div>
      </div>
    </div>
  );
}

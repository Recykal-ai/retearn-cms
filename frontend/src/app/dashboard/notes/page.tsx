import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
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

  return (
    <div className="flex h-screen flex-col" style={{ fontFamily: "var(--font-ui)", background: "var(--canvas)" }}>
      <SubPageTopBar />

      {/* Full-bleed master-detail layout — a centered narrow card (like
          Approvals/Admin use) would leave the note editor too cramped. */}
      <div className="min-h-0 flex-1">
        <Suspense fallback={null}>
          <NotesPageContent isAdmin={isAdmin} currentUserId={session.appUserId!} />
        </Suspense>
      </div>
    </div>
  );
}

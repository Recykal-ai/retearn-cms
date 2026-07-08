import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Route Handlers (unlike Server Components) are allowed to mutate cookies.
// This exists purely so withSessionGuard (lib/session-guard.ts) has a legal
// way to clear a dead NextAuth session cookie and land back on the login
// page, instead of the redirect loop you'd get from calling signOut()
// directly during a Server Component's render.
export async function GET() {
  const cookieStore = await cookies();
  for (const cookie of cookieStore.getAll()) {
    if (cookie.name.includes("authjs.session-token")) {
      cookieStore.delete(cookie.name);
    }
  }
  redirect("/");
}

import { redirect } from "next/navigation";

// Our backend JWT is short-lived (12h — see backend/src/lib/jwt.ts). When it
// expires mid-session, every backend call starts failing with "Invalid or
// expired token," which used to crash the page with an unhandled error and
// leave the user stuck (the NextAuth cookie still looks "signed in," so `/`
// just redirects back into the broken page). Wrap any block that hits the
// backend in this so an expired token cleanly signs the user out instead.
//
// This can't call signOut() directly — Server Components aren't allowed to
// mutate cookies, only Server Actions and Route Handlers are — so it
// redirects to a Route Handler that clears the session cookie instead.
export async function withSessionGuard<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    redirect("/api/force-signout");
    throw err; // unreachable — redirect() navigates by throwing
  }
}

import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const ALLOWED_DOMAIN = "recykal.com";
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      authorization: {
        params: {
          hd: ALLOWED_DOMAIN,
          prompt: "select_account",
        },
      },
    }),
  ],
  callbacks: {
    // Google's `hd` param only hints the account chooser — it does not stop
    // someone from picking a different Google account, so the domain has to
    // be re-verified here before we ever create a session.
    async signIn({ profile }) {
      const email = profile?.email?.toLowerCase() ?? "";
      return email.endsWith(`@${ALLOWED_DOMAIN}`);
    },
    async jwt({ token, profile, account }) {
      if (profile) {
        token.name = profile.name;
        token.email = profile.email;
      }

      // Only runs on the initial sign-in, when Google's id_token is present.
      // The backend is the source of truth for who's allowed in and what
      // role they hold, so we exchange the Google identity for our own JWT
      // here rather than trusting the frontend's domain check alone.
      if (account?.id_token) {
        const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken: account.id_token }),
        });

        if (!res.ok) {
          throw new Error("Backend rejected Google sign-in");
        }

        const data = await res.json();
        token.appToken = data.token;
        token.role = data.user.role;
        token.userId = data.user.id;
      }

      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.name = token.name as string;
        session.user.email = token.email as string;
      }
      session.appToken = token.appToken;
      session.role = token.role;
      session.appUserId = token.userId;
      return session;
    },
  },
  pages: {
    signIn: "/",
    error: "/",
  },
});

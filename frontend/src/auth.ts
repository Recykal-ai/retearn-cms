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
          // access_type: "offline" is what makes Google issue a refresh
          // token alongside the access token — without it we'd only ever
          // get a short-lived access token, unusable for the "export a
          // Google Sheet on demand, whenever the user clicks it" flow (see
          // lib/google-drive.ts on the backend). Google only returns a
          // refresh token on the *first* grant of a given scope, so this
          // doesn't force a repeat consent screen on every sign-in — see
          // the jwt callback below for how that's handled.
          access_type: "offline",
          // The Google provider's own default is just "openid email
          // profile" — access_type/prompt alone don't add drive.readonly to
          // what's actually requested, this scope string is what does.
          // Explicit here (not relying on a merge with the provider's
          // default) so it's obvious exactly what's being asked for.
          scope: "openid email profile https://www.googleapis.com/auth/drive.readonly",
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
      // here rather than trusting the frontend's domain check alone. The
      // access/refresh token are forwarded in the same call so the backend
      // can store them for the Sheets-export feature — refreshToken is only
      // present here on the account's *first* grant of the drive.readonly
      // scope; the backend already knows to keep the previously-stored one
      // on later logins where it's absent (see routes/auth.ts).
      if (account?.id_token) {
        const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            idToken: account.id_token,
            accessToken: account.access_token,
            refreshToken: account.refresh_token,
            expiresAt: account.expires_at,
          }),
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

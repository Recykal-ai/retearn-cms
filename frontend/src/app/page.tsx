import Image from "next/image";
import { redirect } from "next/navigation";
import { auth, signIn } from "@/auth";
import { GoogleIcon } from "@/components/google-icon";

export default async function LoginPage() {
  const session = await auth();
  if (session) {
    redirect("/dashboard");
  }

  return (
    <main className="relative flex min-h-screen flex-1 overflow-hidden bg-white">
      <div
        aria-hidden
        className="animate-blob pointer-events-none absolute -bottom-72 -left-72 h-[600px] w-[600px] rounded-full"
        style={{
          background:
            "radial-gradient(circle at 35% 35%, var(--brand-purple-light) 0%, var(--brand-purple) 40%, transparent 72%)",
          filter: "blur(64px)",
        }}
      />

      <div className="animate-fade-up absolute top-8 right-10 z-10">
        <Image
          src="/retearn-logo.png"
          alt="Retearn"
          width={623}
          height={207}
          priority
          className="h-auto w-[120px]"
        />
      </div>

      <div className="relative z-10 flex flex-1 items-center px-10 sm:px-16 lg:px-24">
        <div className="max-w-xl">
          <p
            className="animate-fade-up font-[family-name:var(--font-poppins)] text-2xl font-semibold"
            style={{ color: "var(--brand-purple)", animationDelay: "0ms" }}
          >
            Welcome to
          </p>
          <h1
            className="animate-fade-up font-[family-name:var(--font-poppins)] mt-1 text-6xl font-extrabold tracking-tight text-neutral-900 sm:text-7xl"
            style={{ animationDelay: "120ms" }}
          >
            Retearn CMS
          </h1>
          <p
            className="animate-fade-up font-[family-name:var(--font-roboto)] mt-6 max-w-md text-base leading-relaxed text-neutral-600"
            style={{ animationDelay: "240ms" }}
          >
            Your team&apos;s single source of truth for documents — search,
            browse, and manage everything in one place.
          </p>

          <form
            action={async () => {
              "use server";
              await signIn("google", { redirectTo: "/dashboard" });
            }}
            className="animate-fade-up mt-12"
            style={{ animationDelay: "360ms" }}
          >
            <p className="font-[family-name:var(--font-roboto)] mb-3 text-sm font-medium text-neutral-500">
              Log in:
            </p>
            <button
              type="submit"
              className="inline-flex items-center gap-3 rounded-md bg-neutral-900 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-neutral-800"
            >
              <GoogleIcon className="h-4 w-4" />
              Continue with Google
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}

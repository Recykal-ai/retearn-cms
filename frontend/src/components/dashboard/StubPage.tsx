import Image from "next/image";
import Link from "next/link";

export function StubPage({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen flex-col" style={{ fontFamily: "var(--font-ui)", background: "var(--canvas)" }}>
      <div
        className="flex h-15 flex-shrink-0 items-center px-6 shadow-sm"
        style={{
          background: "linear-gradient(180deg, var(--header-gradient-start) 0%, var(--header-gradient-end) 100%)",
        }}
      >
        <Link href="/dashboard" aria-label="Go to dashboard home">
          <Image
            src="/retearn-logo.png"
            alt="Retearn"
            width={623}
            height={207}
            priority
            className="h-8 w-auto"
            style={{ filter: "brightness(0) invert(1)" }}
          />
        </Link>
      </div>
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-lg rounded-lg border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
          <h1 className="mb-3 text-lg font-semibold text-neutral-900 dark:text-neutral-200">{title}</h1>
          <div className="space-y-2 text-sm leading-relaxed text-neutral-500 dark:text-neutral-400">{children}</div>
          <Link
            href="/dashboard"
            className="mt-6 inline-block text-sm font-medium"
            style={{ color: "var(--brand-purple)" }}
          >
            ← Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

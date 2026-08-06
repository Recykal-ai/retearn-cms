import Image from "next/image";
import Link from "next/link";
import { SearchBar } from "@/components/dashboard/SearchBar";
import { NotificationBell } from "@/components/dashboard/NotificationBell";
import { ThemeToggle } from "@/components/dashboard/ThemeToggle";

export function TopBar({ query }: { query?: string }) {
  return (
    <header
      className="grid h-15 flex-shrink-0 grid-cols-[1fr_auto_1fr] items-center px-6 shadow-sm"
      style={{
        background: "linear-gradient(180deg, var(--header-gradient-start) 0%, var(--header-gradient-end) 100%)",
      }}
    >
      {/* Even on /dashboard itself, this resets away from whatever team/
          product/filter is currently in the URL back to the true home. */}
      <Link href="/dashboard" className="justify-self-start" aria-label="Go to dashboard home">
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

      <SearchBar query={query} />

      <div className="flex items-center gap-1 justify-self-end">
        <ThemeToggle />
        <NotificationBell />
      </div>
    </header>
  );
}

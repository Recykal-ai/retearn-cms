import Image from "next/image";
import { SearchBar } from "@/components/dashboard/SearchBar";

export function TopBar({ query }: { query?: string }) {
  return (
    <header
      className="grid h-15 flex-shrink-0 grid-cols-[1fr_auto_1fr] items-center px-6 shadow-sm"
      style={{
        background: "linear-gradient(180deg, var(--brand-purple) 0%, var(--brand-purple-dark) 100%)",
      }}
    >
      <Image
        src="/retearn-logo.png"
        alt="Retearn"
        width={623}
        height={207}
        priority
        className="h-8 w-auto justify-self-start"
        style={{ filter: "brightness(0) invert(1)" }}
      />

      <SearchBar query={query} />

      <div />
    </header>
  );
}

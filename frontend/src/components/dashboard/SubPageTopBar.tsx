import Image from "next/image";
import Link from "next/link";
import { CloseButton } from "@/components/dashboard/CloseButton";

// Shared header for every full-page dashboard route that isn't the main
// /dashboard view itself (Approvals, Pinned, Notes, Recycle Bin, Admin) —
// was duplicated identically across all five before this, which is exactly
// why the logo-links-home fix needed to land in one place, not five.
export function SubPageTopBar() {
  return (
    <div
      className="flex h-15 flex-shrink-0 items-center justify-between px-6 shadow-sm"
      style={{ background: "linear-gradient(180deg, var(--brand-purple) 0%, var(--brand-purple-dark) 100%)" }}
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
      <CloseButton href="/dashboard" />
    </div>
  );
}

"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/dashboard/Icon";

export function CloseButton({ href }: { href: string }) {
  const router = useRouter();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") router.push(href);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [router, href]);

  return (
    <button
      type="button"
      onClick={() => router.push(href)}
      aria-label="Close, back to dashboard"
      className="flex flex-col items-center gap-0.5 text-white/70 transition-colors hover:text-white"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white/40 transition-colors group-hover:border-white/70">
        <Icon name="Menu/Close_SM" size={13} />
      </span>
      <span className="text-[10px] font-semibold tracking-wide">ESC</span>
    </button>
  );
}

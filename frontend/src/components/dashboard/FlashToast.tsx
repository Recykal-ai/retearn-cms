"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useToast } from "@/components/ToastProvider";

const FLASH_MESSAGES: Record<
  string,
  { message: string; kind: "success" | "error"; action?: { href: string; label: string } }
> = {
  upload_published: { message: "Upload successful — published.", kind: "success" },
  upload_pending: {
    message: "Document sent for approval.",
    kind: "success",
    action: { href: "/dashboard/approvals", label: "Check here" },
  },
  upload_error: { message: "Upload failed.", kind: "error" },
};

// Reads the one-time `?flash=` param a server action's redirect() can carry
// (uploadDocumentAction is the only action that redirects rather than
// running client-side, so it's the only one that needs this — everything
// else calls useToast() directly right after awaiting its action).
export function FlashToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { show } = useToast();

  useEffect(() => {
    const flash = searchParams.get("flash");
    if (!flash) return;
    const entry = FLASH_MESSAGES[flash];
    if (entry) show(entry.message, entry.kind, entry.action);

    const next = new URLSearchParams(searchParams);
    next.delete("flash");
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [searchParams, router, pathname, show]);

  return null;
}

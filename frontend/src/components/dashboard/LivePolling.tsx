"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Quietly re-fetches the current route's server-rendered data every few
// seconds, so a doc someone else just uploaded/approved/deleted shows up
// without a manual refresh. Short polling rather than WebSockets/SSE — a
// deliberate simpler trade-off, not true real-time push.
export function LivePolling({ intervalMs = 8000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}

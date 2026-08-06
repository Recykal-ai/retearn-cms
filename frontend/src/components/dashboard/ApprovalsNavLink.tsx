"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApprovalsCountAction } from "@/app/dashboard/documents-actions";
import { Icon } from "@/components/dashboard/Icon";

const POLL_MS = 8000;

// Small red-dot/count badge on the "Approval" nav link so an Admin notices
// there's something waiting (a pending upload or a deletion request) without
// having to click in — only ever non-zero for Admin/Super Admin (the
// server action returns 0s for a plain User). A User's own "your submission
// was resolved" signal lives in the Notifications bell instead (see
// NotificationBell.tsx) — this link is purely the reviewer work-queue count.
export function ApprovalsNavLink({ isAdmin }: { isAdmin: boolean }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    async function poll() {
      const result = await getApprovalsCountAction().catch(() => null);
      if (!cancelled && result) setCount(result.pendingUploads + result.deletionRequests);
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isAdmin]);

  return (
    <Link
      href="/dashboard/approvals"
      className="relative flex items-center gap-1.5 text-sm font-semibold text-neutral-700 transition-colors hover:text-neutral-900 dark:text-neutral-300 dark:hover:text-neutral-100"
    >
      <Icon name="Interface/Check_Big" size={14} className="text-neutral-500 dark:text-neutral-400" />
      Approval
      {count > 0 && (
        <span
          aria-label={`${count} item${count === 1 ? "" : "s"} waiting on review`}
          className="absolute -top-2 -right-3 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
          style={{ background: "#b3342c" }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}

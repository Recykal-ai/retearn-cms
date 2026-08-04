"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getApprovalsCountAction, getMyApprovalsUnseenAction } from "@/app/dashboard/documents-actions";
import { Icon } from "@/components/dashboard/Icon";

const POLL_MS = 8000;

// Small badge on the "Approval" nav link. For an Admin/Super Admin it's a
// red dot/count of items waiting on their review. For a plain User it's a
// green checkmark instead — no count, just "something you submitted or
// asked to delete was just resolved" — cleared the moment they open the
// Approvals tab (see markApprovalsSeen in approvals/page.tsx).
export function ApprovalsNavLink({ isAdmin }: { isAdmin: boolean }) {
  const [count, setCount] = useState(0);
  const [hasUnseen, setHasUnseen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (isAdmin) {
        const result = await getApprovalsCountAction().catch(() => null);
        if (!cancelled && result) setCount(result.pendingUploads + result.deletionRequests);
      } else {
        const result = await getMyApprovalsUnseenAction().catch(() => null);
        if (!cancelled && result) setHasUnseen(result.hasUnseen);
      }
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
      className="relative flex items-center gap-1.5 text-sm font-semibold text-neutral-700 transition-colors hover:text-neutral-900"
    >
      <Icon name="Interface/Check_Big" size={14} className="text-neutral-500" />
      Approval
      {isAdmin && count > 0 && (
        <span
          aria-label={`${count} item${count === 1 ? "" : "s"} waiting on review`}
          className="absolute -top-2 -right-3 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
          style={{ background: "#b3342c" }}
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
      {!isAdmin && hasUnseen && (
        <span
          aria-label="One of your submissions was resolved"
          className="absolute -top-2 -right-3 flex h-4 w-4 items-center justify-center rounded-full text-white"
          style={{ background: "#2e7d3f" }}
        >
          <Icon name="Interface/Check_Big" size={9} className="text-white" />
        </span>
      )}
    </Link>
  );
}

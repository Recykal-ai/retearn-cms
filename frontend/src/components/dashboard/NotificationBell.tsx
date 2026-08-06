"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getNotificationsAction,
  getUnreadNotificationsCountAction,
  markNotificationReadAction,
  markAllNotificationsReadAction,
} from "@/app/dashboard/notes-actions";
import type { NotificationEntry } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import { Icon } from "@/components/dashboard/Icon";

const POLL_MS = 8000;

// Per-type icon + tint — @ for a mention, tick/cross for an approval-flow
// outcome, so the row's subject is identifiable at a glance without reading
// the text first (same idea as Discord's per-notification-kind icon).
const TYPE_STYLE: Record<NotificationEntry["type"], { icon: string; bg: string; fg: string }> = {
  MENTION: { icon: "Edit/Mention", bg: "#f2e8fb", fg: "#7c3aed" },
  DOCUMENT_APPROVED: { icon: "Interface/Check_Big", bg: "#eaf6ec", fg: "#2e7d3f" },
  DOCUMENT_REJECTED: { icon: "Menu/Close_SM", bg: "#fbe9e9", fg: "#b3342c" },
  DELETION_APPROVED: { icon: "Interface/Check_Big", bg: "#eaf6ec", fg: "#2e7d3f" },
  DELETION_REJECTED: { icon: "Menu/Close_SM", bg: "#fbe9e9", fg: "#b3342c" },
};

// The note title renders highlighted (purple) inside a mention row so it's
// easy to pick out at a glance — everything else stays plain text.
function renderDescription(n: NotificationEntry) {
  switch (n.type) {
    case "MENTION":
      return (
        <>
          <span className="font-medium">{n.triggeredBy.name}</span> mentioned you in{" "}
          <span className="font-medium" style={{ color: "var(--brand-purple)" }}>
            {n.noteTitle}
          </span>
        </>
      );
    case "DOCUMENT_APPROVED":
      return <>Your upload &ldquo;{n.documentTitle}&rdquo; was approved</>;
    case "DOCUMENT_REJECTED":
      return <>Your upload &ldquo;{n.documentTitle}&rdquo; was rejected</>;
    case "DELETION_APPROVED":
      return <>Your deletion request for &ldquo;{n.documentTitle}&rdquo; was approved</>;
    case "DELETION_REJECTED":
      return <>Your deletion request for &ldquo;{n.documentTitle}&rdquo; was declined</>;
  }
}

function destinationFor(n: NotificationEntry): string {
  if (n.type === "MENTION") {
    return n.commentId ? `/dashboard/notes?teamNote=${n.teamNoteId}&comment=${n.commentId}` : `/dashboard/notes?teamNote=${n.teamNoteId}`;
  }
  return "/dashboard/approvals";
}

// A single unified inbox for both @mentions and upload/deletion-request
// outcomes — replaces the old per-feature badges (the "MENTIONS" list that
// used to stack above the Notes folder tree, and the green-tick Approval nav
// badge) with one bell. Mounted only in TopBar.tsx (the home dashboard) —
// having it repeat on every sub-page (Approvals, Notes, etc. via
// SubPageTopBar.tsx) read as redundant, since each of those already surfaces
// its own relevant state (the Notes folder tree's own unread dots, the
// Approvals tab itself).
export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationEntry[] | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const result = await getUnreadNotificationsCountAction().catch(() => null);
      if (!cancelled && result) setCount(result.count);
    }
    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Refetch every time the popup opens, not just the first time — matches
  // SideRail's Recents popover, since the list changes from actions taken
  // elsewhere (a new mention, an approval decision) between opens.
  useEffect(() => {
    let cancelled = false;
    if (open) {
      getNotificationsAction().then((n) => {
        if (!cancelled) setNotifications(n);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [open]);

  // GET /api/notifications only ever returns unread rows (see notifications.ts)
  // — so a click here needs to drop the row from the visible list right away,
  // not just re-style it in place, or it'd resurface the next time the panel
  // opens even though it's already been marked read server-side.
  async function handleOpenNotification(n: NotificationEntry) {
    await markNotificationReadAction(n.id);
    setNotifications((prev) => prev?.filter((x) => x.id !== n.id) ?? null);
    setCount((c) => Math.max(0, c - 1));
    setOpen(false);
    router.push(destinationFor(n));
  }

  async function handleMarkAllRead() {
    await markAllNotificationsReadAction();
    setNotifications([]);
    setCount(0);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Notifications"
        aria-label={count > 0 ? `${count} unread notification${count === 1 ? "" : "s"}` : "Notifications"}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white"
      >
        <Icon name="Communication/Bell" size={17} />
        {count > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white"
            style={{ background: "#b3342c" }}
          >
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute top-11 right-0 z-30 w-80 rounded-md border border-neutral-200 bg-white shadow-lg dark:border-neutral-700 dark:bg-neutral-900" style={{ fontFamily: "var(--font-ui)" }}>
          <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-2 dark:border-neutral-800">
            <p className="text-xs font-semibold tracking-wide text-neutral-400 uppercase dark:text-neutral-500">Notifications</p>
            {notifications !== null && notifications.length > 0 && (
              <button type="button" onClick={handleMarkAllRead} className="text-xs font-medium text-neutral-500 hover:text-neutral-800 dark:text-neutral-400 dark:hover:text-neutral-100">
                Mark all read
              </button>
            )}
          </div>
          {notifications === null ? (
            <p className="px-3 py-6 text-center text-sm text-neutral-400 dark:text-neutral-500">Loading…</p>
          ) : notifications.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-neutral-400 italic dark:text-neutral-500">You&apos;re all caught up</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {notifications.map((n) => {
                const style = TYPE_STYLE[n.type];
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => handleOpenNotification(n)}
                      className="flex w-full items-start gap-2.5 px-3 py-2.5 text-left hover:bg-neutral-50 dark:hover:bg-neutral-800"
                      style={{ background: "var(--brand-purple-tint)" }}
                    >
                      <span
                        className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full"
                        style={{ background: style.bg, color: style.fg }}
                      >
                        <Icon name={style.icon} size={12} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs text-neutral-800 dark:text-neutral-200">{renderDescription(n)}</span>
                        <span className="mt-0.5 block text-[11px] text-neutral-400 dark:text-neutral-500" suppressHydrationWarning>
                          {relativeTime(n.createdAt)}
                        </span>
                      </span>
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--brand-purple)" }} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

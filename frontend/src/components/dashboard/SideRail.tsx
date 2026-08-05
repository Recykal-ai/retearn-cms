"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOutAction } from "@/app/dashboard/actions";
import { Icon } from "@/components/dashboard/Icon";
import { NotificationSettingsModal } from "@/components/dashboard/NotificationSettingsModal";

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (first + last).toUpperCase();
}

export function SideRail({
  userName,
  userEmail,
  isAdmin,
}: {
  userName: string;
  userEmail: string;
  isAdmin: boolean;
}) {
  const [openMenu, setOpenMenu] = useState<"avatar" | null>(null);
  const [showNotificationSettings, setShowNotificationSettings] = useState(false);
  const railRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (railRef.current && !railRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div
      ref={railRef}
      className="flex w-14 flex-shrink-0 flex-col items-center gap-3 border-r pt-4 pb-4"
      style={{ fontFamily: "var(--font-ui)", background: "var(--canvas)", borderColor: "var(--canvas-border)" }}
    >
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu((m) => (m === "avatar" ? null : "avatar"))}
          title={userName}
          className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white transition-transform hover:scale-105"
          style={{ background: "var(--brand-purple)" }}
        >
          {initials(userName)}
        </button>

        {openMenu === "avatar" && (
          <div className="absolute top-11 left-0 z-20 w-52 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
            <div className="border-b border-neutral-100 px-3 py-2">
              <p className="truncate text-sm font-medium text-neutral-800">{userName}</p>
              <p className="truncate text-xs text-neutral-500">{userEmail}</p>
            </div>
            {isAdmin && (
              <Link
                href="/dashboard/admin"
                className="block px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
                onClick={() => setOpenMenu(null)}
              >
                Admin dashboard
              </Link>
            )}
            <button
              type="button"
              onClick={() => {
                setOpenMenu(null);
                setShowNotificationSettings(true);
              }}
              className="block w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
            >
              Notification settings
            </button>
            <form action={signOutAction}>
              <button
                type="submit"
                className="block w-full px-3 py-2 text-left text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>

      <Link
        href="/dashboard/recent"
        title="Recent"
        aria-label="Recently viewed or edited documents"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700"
      >
        <Icon name="Calendar/Clock" size={16} />
      </Link>

      <Link
        href="/dashboard/pinned"
        title="Pinned"
        aria-label="Documents you've pinned"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700"
      >
        <Icon name="Interface/Star" size={15} />
      </Link>

      <Link
        href="/dashboard/notes"
        title="Notes"
        aria-label="Notes — personal and team"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700"
      >
        <Icon name="File/Note" size={15} />
      </Link>

      {isAdmin && (
        <Link
          href="/dashboard/recycle-bin"
          title="Recycle Bin"
          aria-label="Recycle Bin — deleted documents"
          className="mt-auto flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700"
        >
          <Icon name="Interface/Trash_Empty" size={15} />
        </Link>
      )}
      {showNotificationSettings && <NotificationSettingsModal onClose={() => setShowNotificationSettings(false)} />}
    </div>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOutAction } from "@/app/dashboard/actions";
import { getRecentDocumentsAction } from "@/app/dashboard/documents-actions";
import { getUnreadNotificationsCountAction } from "@/app/dashboard/notes-actions";
import type { DocumentSummary } from "@/lib/api";
import { FileTypeIcon } from "@/components/dashboard/FileTypeIcon";
import { fileTypeOf } from "@/lib/file-type";
import { useDocumentViewer } from "@/components/dashboard/useDocumentViewer";

const NOTES_POLL_MS = 8000;

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
  const [openMenu, setOpenMenu] = useState<"avatar" | "recents" | null>(null);
  const [recentDocs, setRecentDocs] = useState<DocumentSummary[] | null>(null);
  const [unreadNotes, setUnreadNotes] = useState(0);
  const { view, isOpening, viewerNode } = useDocumentViewer();
  const railRef = useRef<HTMLDivElement>(null);

  // Polls regardless of whether the Notes popup is open — anyone could be
  // @mentioned in a team note at any time, matching ApprovalsNavLink's cadence.
  useEffect(() => {
    let cancelled = false;
    async function poll() {
      const result = await getUnreadNotificationsCountAction().catch(() => null);
      if (!cancelled && result) setUnreadNotes(result.count);
    }
    poll();
    const id = setInterval(poll, NOTES_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (railRef.current && !railRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  // Refetch every time the popup opens, not just the first time — the list
  // changes from actions taken elsewhere (viewing/editing a doc), and a
  // stale in-memory list from an earlier open would show the wrong order.
  useEffect(() => {
    let cancelled = false;
    if (openMenu === "recents") {
      getRecentDocumentsAction().then((docs) => {
        if (!cancelled) setRecentDocs(docs);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [openMenu]);

  async function handleOpen(doc: DocumentSummary) {
    await view(doc);
    setOpenMenu(null);
  }

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

      <div className="relative">
        <button
          type="button"
          onClick={() => setOpenMenu((m) => (m === "recents" ? null : "recents"))}
          title="Recents"
          aria-label="Recently opened or edited files"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700"
        >
          <ClockIcon />
        </button>

        {openMenu === "recents" && (
          <div className="absolute top-11 left-0 z-20 w-64 rounded-md border border-neutral-200 bg-white p-3 shadow-lg">
            <p className="mb-2 text-xs font-semibold tracking-wide text-neutral-400 uppercase">Recent</p>
            {recentDocs === null ? (
              <p className="px-1 text-sm text-neutral-400">Loading…</p>
            ) : recentDocs.length === 0 ? (
              <p className="px-1 text-sm text-neutral-400 italic">No recent files yet</p>
            ) : (
              <ul className="max-h-80 space-y-0.5 overflow-y-auto">
                {recentDocs.map((doc) => (
                  <li key={doc.id}>
                    <button
                      type="button"
                      onClick={() => handleOpen(doc)}
                      disabled={isOpening(doc.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-neutral-50 disabled:opacity-60"
                    >
                      <FileTypeIcon type={fileTypeOf(doc.title, doc.sourceType)} />
                      <span className="truncate text-sm text-neutral-700">
                        {isOpening(doc.id) ? "Opening…" : doc.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <Link
        href="/dashboard/pinned"
        title="Pinned"
        aria-label="Documents you've pinned"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700"
      >
        <StarRailIcon />
      </Link>

      <Link
        href="/dashboard/notes"
        title="Notes"
        aria-label="Notes — personal and team"
        className="relative flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700"
      >
        <NoteRailIcon />
        {unreadNotes > 0 && (
          <span
            aria-label={`${unreadNotes} unread mention${unreadNotes === 1 ? "" : "s"}`}
            className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white"
            style={{ background: "#b3342c" }}
          >
            {unreadNotes > 9 ? "9+" : unreadNotes}
          </span>
        )}
      </Link>

      {isAdmin && (
        <Link
          href="/dashboard/recycle-bin"
          title="Recycle Bin"
          aria-label="Recycle Bin — deleted documents"
          className="mt-auto flex h-9 w-9 items-center justify-center rounded-full border border-neutral-300 bg-white text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700"
        >
          <TrashIcon />
        </Link>
      )}
      {viewerNode}
    </div>
  );
}

function NoteRailIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M6 4.5h9.5L19 8v11a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5.5a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M9 10h6M9 13.5h6M9 17h3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function StarRailIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 3.5l2.6 5.4 5.9.8-4.3 4.2 1 5.9-5.2-2.8-5.2 2.8 1-5.9-4.3-4.2 5.9-.8L12 3.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h14M9.5 7V5.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2V7M7.5 7l.9 12.1A1.5 1.5 0 0 0 9.9 20.5h4.2a1.5 1.5 0 0 0 1.5-1.4L16.5 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M10.3 10.5v6M13.7 10.5v6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 7v5l3.5 2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

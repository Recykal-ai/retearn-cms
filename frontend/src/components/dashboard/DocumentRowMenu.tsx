"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { DocumentSummary } from "@/lib/api";
import { deleteDocumentAction, requestDeletionAction } from "@/app/dashboard/documents-actions";
import { EditVersionModal } from "@/components/dashboard/EditVersionModal";
import { VersionHistoryModal } from "@/components/dashboard/VersionHistoryModal";
import { useToast } from "@/components/ToastProvider";
import { Icon } from "@/components/dashboard/Icon";

export function DocumentRowMenu({
  doc,
  canEdit,
  isAdmin,
}: {
  doc: DocumentSummary;
  canEdit: boolean;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState<"edit" | "history" | "delete" | null>(null);
  const [shareState, setShareState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  // Copies a link back into the app (?doc=<id>, opened by AutoOpenDocument),
  // never the raw signed file URL — that URL expires in minutes and, worse,
  // opening it directly hands the file to the browser's own viewer/downloader
  // instead of our view-only in-app one. Same link for every doc type; a LINK
  // doc's viewer already knows to just open the external URL directly.
  async function handleShare() {
    setShareState("copying");
    try {
      const shareUrl = `${window.location.origin}/dashboard?doc=${doc.id}`;
      await navigator.clipboard.writeText(shareUrl);
      setShareState("copied");
      window.setTimeout(() => {
        setShareState("idle");
        setOpen(false);
      }, 1500);
    } catch {
      setShareState("error");
      window.setTimeout(() => setShareState("idle"), 1500);
    }
  }

  return (
    <div ref={menuRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="More options"
        // Deliberately always visible, not opacity-0-until-hover — touch
        // devices have no real hover state, so a hover-only reveal meant
        // this was undiscoverable without first tapping the row by accident.
        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
      >
        <Icon name="Menu/More_Vertical" size={16} />
      </button>

      {open && (
        <div className="absolute top-full right-0 z-20 mt-1 w-48 rounded-md border border-neutral-200 bg-white py-1 text-sm shadow-lg">
          {canEdit && (
            <MenuItem
              icon={<Icon name="Edit/Edit_Pencil_01" size={14} />}
              onClick={() => {
                setModal("edit");
                setOpen(false);
              }}
            >
              Edit
            </MenuItem>
          )}
          <MenuItem
            icon={<Icon name="Calendar/Clock" size={14} />}
            onClick={() => {
              setModal("history");
              setOpen(false);
            }}
          >
            Version history
          </MenuItem>
          <MenuItem icon={<Icon name="Communication/Share_Android" size={14} />} onClick={handleShare}>
            {shareState === "copied"
              ? "Link copied"
              : shareState === "copying"
                ? "Copying…"
                : shareState === "error"
                  ? "Couldn't copy link"
                  : "Share (copy link)"}
          </MenuItem>
          <MenuItem
            icon={<Icon name="Interface/Trash_Empty" size={14} />}
            danger
            onClick={() => {
              setModal("delete");
              setOpen(false);
            }}
          >
            {isAdmin ? "Delete" : "Request deletion"}
          </MenuItem>
        </div>
      )}

      {modal === "edit" && <EditVersionModal doc={doc} onClose={() => setModal(null)} />}
      {modal === "history" && (
        <VersionHistoryModal
          documentId={doc.id}
          title={doc.title}
          currentVersion={doc.currentVersion}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "delete" && (
        <DeleteOrRequestModal doc={doc} isAdmin={isAdmin} onClose={() => setModal(null)} />
      )}
    </div>
  );
}

function DeleteOrRequestModal({
  doc,
  isAdmin,
  onClose,
}: {
  doc: DocumentSummary;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteDocumentAction(doc.id);
      if (result.error) {
        show(result.error, "error");
        return;
      }
      show(`"${doc.title}" deleted.`);
      onClose();
    });
  }

  function handleRequest() {
    startTransition(async () => {
      const result = await requestDeletionAction(doc.id, note);
      if (result.error) {
        show(result.error, "error");
        return;
      }
      show("Deletion requested.");
      setDone(true);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      style={{ fontFamily: "var(--font-ui)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        {isAdmin ? (
          <>
            <h1 className="mb-2 text-lg font-semibold text-neutral-900">Delete document?</h1>
            <p className="mb-5 text-sm text-neutral-500">
              &ldquo;{doc.title}&rdquo; will be removed from all lists. Deleted documents can be recovered by
              Admins and Super Admins from the Recycle Bin.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={isPending}
                className="rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "#b3342c" }}
              >
                {isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </>
        ) : done ? (
          <>
            <h1 className="mb-2 text-lg font-semibold text-neutral-900">Deletion requested</h1>
            <p className="mb-5 text-sm text-neutral-500">An admin will review and confirm removal.</p>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
                style={{ background: "var(--brand-purple)" }}
              >
                Done
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-lg font-semibold text-neutral-900">Request deletion</h1>
            <p className="mb-3 text-sm text-neutral-500">
              &ldquo;{doc.title}&rdquo; won&apos;t be removed immediately — an admin will review your request.
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why should this be removed? (optional)"
              rows={3}
              className="mb-5 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-400 focus:outline-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleRequest}
                disabled={isPending}
                className="rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                style={{ background: "#b3342c" }}
              >
                {isPending ? "Sending…" : "Request deletion"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  icon,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 px-3 py-1.5 text-left hover:bg-neutral-50"
      style={{ color: danger ? "#b3342c" : "#404040" }}
    >
      <span className="shrink-0" style={{ color: danger ? "#b3342c" : "#8a8a8a" }} aria-hidden>
        {icon}
      </span>
      {children}
    </button>
  );
}

"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { getDocumentAction } from "@/app/dashboard/documents-actions";
import { useDocumentViewer } from "@/components/dashboard/useDocumentViewer";
import { useToast } from "@/components/ToastProvider";

// Reads a one-time `?doc=<id>` param (the target of a "Share" link — see
// DocumentRowMenu.tsx) and opens that document in our own in-app viewer,
// same as clicking it in a list would. This is what makes a shared link
// actually view-only: the link points back into the portal rather than at
// the raw signed file URL, so opening it always goes through the viewer
// (and its auth/permission checks) instead of the browser's native handler.
export function AutoOpenDocument() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { view, viewerNode } = useDocumentViewer();
  const { show } = useToast();

  // `view`/`show` aren't memoized by their hooks, and calling `view` changes
  // state that gives it a new identity on the next render — if either were
  // in the effect's dependency array, opening the doc would change `view`,
  // which would re-run the effect, which would open it again, forever (this
  // is exactly what was happening: the URL param never settled and pdf.js
  // kept restarting). Refs sidestep that: the effect only ever depends on
  // `searchParams`, and always calls whatever `view`/`show` currently are.
  const viewRef = useRef(view);
  const showRef = useRef(show);
  useEffect(() => {
    viewRef.current = view;
    showRef.current = show;
  });

  useEffect(() => {
    const docId = searchParams.get("doc");
    if (!docId) return;
    let cancelled = false;

    // Strip the param only after the fetch settles, not before — stripping
    // it immediately would change `searchParams` and re-run this effect
    // before the in-flight fetch ever gets to open the viewer.
    getDocumentAction(docId)
      .then((doc) => {
        // viaLink: true — this fires from a page-load effect, not a click,
        // so for docx/unsupported kinds view() shows a landing card with its
        // own real "Open" button instead of trying to auto-pop a new tab
        // (which browsers block without a genuine user gesture behind it).
        if (!cancelled) viewRef.current({ id: doc.id, title: doc.title }, { viaLink: true });
      })
      .catch(() => {
        if (!cancelled) {
          showRef.current("This document is no longer available — it may have been removed.", "error");
        }
      })
      .finally(() => {
        if (cancelled) return;
        const next = new URLSearchParams(searchParams);
        next.delete("doc");
        const query = next.toString();
        router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deliberate, see comment above
  }, [searchParams]);

  return viewerNode;
}

type FreshUrlFetcher = () => Promise<{ url: string; sourceType: "FILE" | "LINK" }>;

// Google's own read-only viewer (docs.google.com/viewer) — distinct from
// Google Drive: this never uploads anything or transfers ownership, it's
// just an external render of the same signed URL we already use, with no
// download affordance and no sign-in required. Verified directly: the only
// menu option in its own UI (when not signed in) is "Find" — no Download
// anywhere in that path.
//
// Deliberately NOT passing embedded=true: that flag is for loading the
// viewer inside an <iframe> (it also relaxes X-Frame-Options for that case).
// We always open it as a direct, top-level tab via openGoogleViewer below —
// and reproduced live that embedded=true in that context makes Google serve
// the response as a raw download (named "viewer", no extension) instead of
// rendering the page, which silently failed once the presigned S3 URL
// expired. Dropping the param renders the normal full-page viewer instead.
export function googleViewerUrl(fileUrl: string): string {
  return `https://docs.google.com/viewer?url=${encodeURIComponent(fileUrl)}`;
}

// Opens the tab synchronously (as a direct result of the click, so browsers
// don't treat it as a blocked popup) and only navigates it once a fresh
// signed URL comes back — refetching here rather than reusing a URL fetched
// earlier, since our signed URLs are short-lived (5 min) and Google's own
// fetch+convert needs the rest of that window to land. Returns a promise so
// callers can track loading state for the actual duration of the fetch.
export function openGoogleViewer(getFreshUrl: FreshUrlFetcher, onError: () => void): Promise<void> {
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  return getFreshUrl()
    .then((fresh) => {
      if (tab) tab.location.href = googleViewerUrl(fresh.url);
    })
    .catch(() => {
      tab?.close();
      onError();
    });
}

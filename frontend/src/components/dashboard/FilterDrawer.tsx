"use client";

// Shared right-side slide-over shell for FilterPanel.tsx, PinnedPageContent.tsx,
// and RecycleBinList.tsx.
//
// Backdrop and panel are each their own independently-positioned `fixed`
// element, NOT a `flex justify-end` pair. That pairing looked equivalent but
// wasn't: flexbox reserves the panel's w-80 of space in the layout
// regardless of its CSS transform (transforms only move where something
// paints, not the space it occupies), so the backdrop's `flex-1` sibling
// could only ever cover the left "viewport width minus 320px" — it
// structurally could never reach the rightmost 320px strip, open, closed,
// or mid-transition. The dim would fade in over the left portion while the
// strip where the panel was about to slide into stayed completely undimmed
// (plain page content showing through) until the panel physically slid over
// and covered it a beat later — the exact "screen dims except where the
// filter appears, then it pops in" report. Each element covering its own
// full, independent area removes the gap entirely.
export function FilterDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-black/20 transition-opacity duration-300 ease-out ${open ? "opacity-100" : "opacity-0"}`}
        style={{ pointerEvents: open ? "auto" : "none" }}
        onClick={onClose}
        aria-hidden={!open}
      />
      <div
        className={`fixed inset-y-0 right-0 z-50 flex h-full w-80 flex-col overflow-y-auto bg-white shadow-xl transition-transform duration-300 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
        style={{ fontFamily: "var(--font-ui)" }}
        aria-hidden={!open}
      >
        {children}
      </div>
    </>
  );
}

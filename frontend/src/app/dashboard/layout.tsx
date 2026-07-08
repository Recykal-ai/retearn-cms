import { Suspense } from "react";
import { ToastProvider } from "@/components/ToastProvider";
import { LivePolling } from "@/components/dashboard/LivePolling";
import { FlashToast } from "@/components/dashboard/FlashToast";
import { AutoOpenDocument } from "@/components/dashboard/AutoOpenDocument";

// Wraps every /dashboard/* route with cross-cutting client behavior (toasts,
// live polling) without touching any individual page's own layout/chrome —
// each page still renders its own header/TopBar/etc exactly as before.
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <LivePolling />
      <Suspense fallback={null}>
        <FlashToast />
      </Suspense>
      <Suspense fallback={null}>
        <AutoOpenDocument />
      </Suspense>
      {children}
    </ToastProvider>
  );
}

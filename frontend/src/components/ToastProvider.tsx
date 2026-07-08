"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import Link from "next/link";

type ToastKind = "success" | "error";
interface ToastAction {
  href: string;
  label: string;
}
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
}

const ToastContext = createContext<{ show: (message: string, kind?: ToastKind, action?: ToastAction) => void } | null>(
  null,
);

const TOAST_STYLE: Record<ToastKind, { bg: string }> = {
  success: { bg: "#2e7d3f" },
  error: { bg: "#b3342c" },
};

// Mounted once in dashboard/layout.tsx so every dashboard route shares the
// same toast host — server actions can't call client code directly, so each
// call site awaits its action then calls show() itself with the result.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const show = useCallback((message: string, kind: ToastKind = "success", action?: ToastAction) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, kind, action }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
  }, []);

  function dismiss(id: number) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <ToastContext.Provider value={{ show }}>
      {children}
      <div
        className="pointer-events-none fixed right-5 bottom-5 z-[200] flex flex-col gap-2"
        style={{ fontFamily: "var(--font-ui)" }}
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex items-center gap-3 rounded-md px-4 py-2.5 text-sm font-medium text-white shadow-lg"
            style={{ background: TOAST_STYLE[t.kind].bg }}
          >
            <span>{t.message}</span>
            {t.action && (
              <Link
                href={t.action.href}
                onClick={() => dismiss(t.id)}
                className="shrink-0 underline underline-offset-2 hover:opacity-80"
              >
                {t.action.label}
              </Link>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

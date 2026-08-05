"use client";

import { useEffect, useState } from "react";
import {
  getMyNotificationPreferenceAction,
  updateMyNotificationPreferenceAction,
} from "@/app/dashboard/account-actions";
import { useToast } from "@/components/ToastProvider";

// Email on/off only — no Slack option. Slack was scoped out (workspace app
// install needs admin approval the team doesn't have yet); if it comes back
// later this is the natural spot to add a second toggle next to this one.
// Turning this off only stops the automated emails for mentions/uploads/
// approval decisions — the in-app Notification bell keeps working either way.
export function NotificationSettingsModal({ onClose }: { onClose: () => void }) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const { show } = useToast();

  useEffect(() => {
    getMyNotificationPreferenceAction().then((result) => {
      if (result.error || result.emailNotificationsEnabled === undefined) {
        show(result.error ?? "Failed to load notification settings", "error");
        onClose();
        return;
      }
      setEnabled(result.emailNotificationsEnabled);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggle(next: boolean) {
    setEnabled(next);
    setSaving(true);
    const result = await updateMyNotificationPreferenceAction(next);
    setSaving(false);
    if (result.error) {
      setEnabled(!next);
      show(result.error, "error");
      return;
    }
    show(next ? "Email notifications turned on" : "Email notifications turned off", "success");
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      style={{ fontFamily: "var(--font-ui)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-900">Notification settings</h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-xl leading-none text-neutral-400 hover:text-neutral-600"
          >
            ×
          </button>
        </div>

        <p className="mb-4 text-sm text-neutral-500">
          Mentions, uploads, and approval decisions always show up in your notification bell. This only controls
          whether we also email you about them.
        </p>

        <div className="mb-5 flex items-center justify-between rounded-md border border-neutral-200 px-3 py-2.5">
          <div>
            <p className="text-sm font-medium text-neutral-800">Email notifications</p>
            <p className="text-xs text-neutral-500">{enabled ? "On — you'll get an email too" : "Off — in-app only"}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={enabled ?? false}
            disabled={enabled === null || saving}
            onClick={() => handleToggle(!enabled)}
            className="relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60"
            style={{ background: enabled ? "var(--brand-purple)" : "#d4d4d4" }}
          >
            <span
              className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
              style={{ transform: enabled ? "translateX(20px)" : "translateX(0)" }}
            />
          </button>
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-1.5 text-sm font-semibold text-white"
            style={{ background: "var(--brand-purple)" }}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

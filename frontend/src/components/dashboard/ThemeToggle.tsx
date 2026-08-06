"use client";

import { useTheme } from "@/components/ThemeProvider";
import { Icon } from "@/components/dashboard/Icon";

// Sun when the current theme is light (click to switch to dark), moon when
// dark (click to switch back) — mirrors NotificationBell's placement and
// visibility exactly (mounted in the same TopBar.tsx spot, so it only shows
// wherever the bell does).
export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className="flex h-8 w-8 items-center justify-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white"
    >
      <Icon name={isDark ? "Environment/Moon" : "Environment/Sun"} size={16} />
    </button>
  );
}

"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

type Theme = "light" | "dark";

const STORAGE_KEY = "retearn-theme";

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

// useSyncExternalStore rather than useState+useEffect — the actual theme
// lives outside React (the data-theme attribute layout.tsx's blocking
// script sets on <html> before first paint), so this hook's job is to read
// that external value safely, not own it. Its getServerSnapshot always
// returns "light" (the server has no access to localStorage/data-theme),
// matching the server-rendered markup exactly, so hydration never sees a
// mismatch; getSnapshot then picks up the real value on the client without
// an extra render-then-correct step or a setState-in-effect lint error.
const listeners = new Set<() => void>();

// Matches the transition duration on .theme-transition in globals.css —
// the class needs to come back off afterward so normal hover/interaction
// transitions elsewhere in the app go back to their own (much shorter)
// durations instead of staying stuck at this one.
const TRANSITION_MS = 300;

// Applies a theme to <html>, wrapped in a brief .theme-transition window so
// the color swap fades instead of snapping — shared by both the toggle
// button and cross-tab sync below so switching from another tab fades too.
function applyTheme(next: Theme) {
  const root = document.documentElement;
  root.classList.add("theme-transition");
  root.setAttribute("data-theme", next);
  window.setTimeout(() => root.classList.remove("theme-transition"), TRANSITION_MS);
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  // Fires in every OTHER open tab when one tab's toggle writes localStorage
  // — only that tab's own notifyListeners() call (see toggleTheme) already
  // updated its <html> attribute directly, so the other tabs need to apply
  // the new value themselves before re-reading the snapshot.
  function onStorage(e: StorageEvent) {
    if (e.key !== STORAGE_KEY) return;
    applyTheme(e.newValue === "dark" ? "dark" : "light");
    callback();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(callback);
    window.removeEventListener("storage", onStorage);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function getServerSnapshot(): Theme {
  return "light";
}

function notifyListeners() {
  listeners.forEach((l) => l());
}

// Browser-local only (localStorage), deliberately not synced to the account
// — this is a display preference, not something that needs to follow the
// user across devices.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggleTheme() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    window.localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    notifyListeners();
  }

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

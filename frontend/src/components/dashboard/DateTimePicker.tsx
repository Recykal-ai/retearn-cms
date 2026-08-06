"use client";

import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/dashboard/Icon";

// A from-scratch replacement for <input type="datetime-local"> — the native
// picker's popup is OS/browser chrome, not part of the page, so it can't be
// purple-themed or made to auto-close on selection (both were explicitly
// asked for). Value contract matches the native input exactly
// ("YYYY-MM-DDTHH:mm", local time, empty string for unset) so it drops into
// existing state/handlers unchanged.
//
// Time is a pair of steppers (click ▲/▼, no scrolling) rather than the
// scrollable minute/hour lists an earlier version used — those read as
// cramped and "sticky" to scroll through. Time always has a value the
// instant the popup opens (whatever's already set, or the current time
// rounded to 5 minutes if this is a fresh pick), so picking a day is the
// one clear, always-available "I'm done" gesture — closing on date-click
// is what satisfies "once date and time are selected."
export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick a date & time",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const parsed = parseValue(value);
  const [viewMonth, setViewMonth] = useState(() => parsed?.date ?? new Date());
  const [pendingDate, setPendingDate] = useState<Date | null>(parsed?.date ?? null);
  const [pendingHour, setPendingHour] = useState(parsed?.hour ?? roundedCurrentHour());
  const [pendingMinute, setPendingMinute] = useState(parsed?.minute ?? roundedCurrentMinute());

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  function openPicker() {
    const p = parseValue(value);
    setPendingDate(p?.date ?? null);
    setPendingHour(p?.hour ?? roundedCurrentHour());
    setPendingMinute(p?.minute ?? roundedCurrentMinute());
    setViewMonth(p?.date ?? new Date());
    setOpen(true);
  }

  function pickDay(day: Date) {
    setPendingDate(day);
    onChange(formatValue(day, pendingHour, pendingMinute));
    setOpen(false);
  }

  function stepHour(delta: number) {
    setPendingHour((h) => (h + delta + 24) % 24);
  }

  function stepMinute(delta: number) {
    setPendingMinute((m) => (m + delta + 60) % 60);
  }

  function clear() {
    onChange("");
    setPendingDate(null);
    setOpen(false);
  }

  const monthLabel = viewMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  const days = daysForGrid(viewMonth);
  const today = new Date();

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPicker())}
        className="flex w-full items-center justify-between gap-2 rounded-md border border-neutral-200 px-2.5 py-1.5 text-left text-sm focus:border-neutral-400 focus:outline-none dark:border-neutral-700 dark:focus:border-neutral-500"
      >
        <span className={value ? "text-neutral-800 dark:text-neutral-200" : "text-neutral-400 dark:text-neutral-500"}>{value ? displayValue(value) : placeholder}</span>
        <Icon name="Calendar/Calendar" size={15} style={{ color: "var(--brand-purple)" }} />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-30 mt-1 w-64 rounded-lg border border-neutral-200 bg-white p-3 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewMonth(addMonths(viewMonth, -1))}
              aria-label="Previous month"
              className="flex h-6 w-6 items-center justify-center rounded-md text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700"
              style={{ color: "var(--brand-purple)" }}
            >
              ‹
            </button>
            <span className="text-xs font-semibold text-neutral-700 dark:text-neutral-300">{monthLabel}</span>
            <button
              type="button"
              onClick={() => setViewMonth(addMonths(viewMonth, 1))}
              aria-label="Next month"
              className="flex h-6 w-6 items-center justify-center rounded-md text-sm hover:bg-neutral-100 dark:hover:bg-neutral-700"
              style={{ color: "var(--brand-purple)" }}
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 gap-y-1 text-center text-[10px] font-semibold text-neutral-400 dark:text-neutral-500">
            {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
              <span key={i}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1 text-center text-xs">
            {days.map(({ date, inMonth }) => {
              const isSelected = pendingDate && isSameDay(pendingDate, date);
              const isToday = isSameDay(today, date);
              return (
                <button
                  key={date.toISOString()}
                  type="button"
                  onClick={() => pickDay(date)}
                  className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full ${
                    isSelected || isToday ? "" : inMonth ? "text-neutral-700 dark:text-neutral-300" : "text-neutral-300 dark:text-neutral-600"
                  }`}
                  style={
                    isSelected
                      ? { background: "var(--brand-purple)", color: "white" }
                      : isToday
                        ? { border: "1px solid var(--brand-purple)", color: "var(--brand-purple)" }
                        : undefined
                  }
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>

          <div className="mt-3 flex items-center justify-center gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
            <TimeStepper label="Hour" value={pad(pendingHour)} onUp={() => stepHour(1)} onDown={() => stepHour(-1)} />
            <span className="pb-0.5 text-lg font-semibold text-neutral-400 dark:text-neutral-500">:</span>
            <TimeStepper label="Min" value={pad(pendingMinute)} onUp={() => stepMinute(5)} onDown={() => stepMinute(-5)} />
          </div>

          {value && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear date"
              className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-white text-xs text-neutral-400 shadow hover:text-neutral-600 dark:bg-neutral-900 dark:text-neutral-500 dark:hover:text-neutral-300"
            >
              ×
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function TimeStepper({
  label,
  value,
  onUp,
  onDown,
}: {
  label: string;
  value: string;
  onUp: () => void;
  onDown: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <button
        type="button"
        onClick={onUp}
        aria-label={`Increase ${label.toLowerCase()}`}
        className="flex h-5 w-8 items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
        style={{ color: "var(--brand-purple)" }}
      >
        <Icon name="Arrow/Chevron_Up" size={12} />
      </button>
      <div
        className="flex h-9 w-11 items-center justify-center rounded-md text-base font-semibold"
        style={{ background: "var(--brand-purple-tint)", color: "var(--brand-purple)" }}
      >
        {value}
      </div>
      <button
        type="button"
        onClick={onDown}
        aria-label={`Decrease ${label.toLowerCase()}`}
        className="flex h-5 w-8 items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-700"
        style={{ color: "var(--brand-purple)" }}
      >
        <Icon name="Arrow/Chevron_Down" size={12} />
      </button>
    </div>
  );
}

function addMonths(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

// A 6-row (42-day) grid starting on the Sunday on/before the 1st, so the
// calendar never reflows height between months.
function daysForGrid(viewMonth: Date): { date: Date; inMonth: boolean }[] {
  const firstOfMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth(), 1);
  const start = new Date(firstOfMonth);
  start.setDate(start.getDate() - start.getDay());

  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    return { date, inMonth: date.getMonth() === viewMonth.getMonth() };
  });
}

function roundedCurrentHour(): number {
  return new Date().getHours();
}

function roundedCurrentMinute(): number {
  return Math.round(new Date().getMinutes() / 5) * 5 % 60;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function formatValue(date: Date, hour: number, minute: number): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hour)}:${pad(minute)}`;
}

function parseValue(value: string): { date: Date; hour: number; minute: number } | null {
  if (!value) return null;
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) return null;
  const [y, m, d] = datePart.split("-").map(Number);
  const [h, min] = timePart.split(":").map(Number);
  if ([y, m, d, h, min].some((n) => Number.isNaN(n))) return null;
  return { date: new Date(y, m - 1, d), hour: h, minute: min };
}

function displayValue(value: string): string {
  const p = parseValue(value);
  if (!p) return value;
  return `${pad(p.date.getDate())}-${pad(p.date.getMonth() + 1)}-${p.date.getFullYear()} ${pad(p.hour)}:${pad(p.minute)}`;
}

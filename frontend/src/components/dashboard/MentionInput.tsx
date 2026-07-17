"use client";

import { useRef, useState } from "react";

export interface MentionCandidate {
  id: string;
  label: string;
}

// A plain-text @mention composer for comment replies — deliberately not a
// second Tiptap instance (way more machinery than a one-line reply box
// needs). Mentioned users are tracked by id alongside the typed "@Name "
// text rather than parsed back out of it, since comment bodies are stored
// as plain text, not HTML with a mention span to parse (see
// sanitize-html.ts's extractMentionIds, which this deliberately doesn't
// reuse — there's no markup here to extract from). Typing "@" itself opens
// the dropdown (see handleChange) — there's no separate trigger button for
// it, and no attach-file button either, since neither actually does
// anything yet; a dead button is worse than no button.
export function MentionInput({
  members,
  onSubmit,
  placeholder,
  autoFocus,
}: {
  members: MentionCandidate[];
  onSubmit: (body: string, mentionedUserIds: string[]) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [value, setValue] = useState("");
  const [mentioned, setMentioned] = useState<Record<string, string>>({});
  const [dropdown, setDropdown] = useState<{ query: string; start: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setValue(v);
    const cursor = e.target.selectionStart ?? v.length;
    const uptoCursor = v.slice(0, cursor);
    const atIndex = uptoCursor.lastIndexOf("@");
    if (atIndex !== -1 && !/\s/.test(uptoCursor.slice(atIndex + 1))) {
      setDropdown({ query: uptoCursor.slice(atIndex + 1), start: atIndex });
    } else {
      setDropdown(null);
    }
  }

  function selectMember(m: MentionCandidate) {
    if (!dropdown) return;
    const before = value.slice(0, dropdown.start);
    const after = value.slice(dropdown.start + 1 + dropdown.query.length);
    setValue(`${before}@${m.label} ${after}`);
    setMentioned((prev) => ({ ...prev, [m.label]: m.id }));
    setDropdown(null);
    inputRef.current?.focus();
  }

  function submit() {
    const trimmed = value.trim();
    if (!trimmed) return;
    // "all" (see TeamNoteEditor.tsx's mentionCandidates) is a reserved
    // sentinel, not a real user — expanded here into every actual member id
    // rather than sent as-is, since the backend only ever notifies real
    // TeamNoteMembership rows and would just silently drop it otherwise.
    const ids = Object.entries(mentioned)
      .filter(([name]) => trimmed.includes(`@${name}`))
      .flatMap(([, id]) => (id === "all" ? members.filter((m) => m.id !== "all").map((m) => m.id) : [id]));
    onSubmit(trimmed, [...new Set(ids)]);
    setValue("");
    setMentioned({});
    setDropdown(null);
  }

  const filtered = dropdown
    ? members.filter((m) => m.label.toLowerCase().includes(dropdown.query.toLowerCase())).slice(0, 6)
    : [];

  return (
    <div className="relative flex items-center gap-1">
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={value}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !dropdown) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") setDropdown(null);
        }}
        placeholder={placeholder ?? "Reply…"}
        className="w-full rounded-md border border-neutral-200 px-2 py-1 text-xs focus:border-neutral-400 focus:outline-none"
      />
      <button
        type="button"
        onClick={submit}
        aria-label="Send"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white"
        style={{ background: "var(--brand-purple)" }}
      >
        <SendIcon />
      </button>

      {dropdown && filtered.length > 0 && (
        <div className="absolute bottom-full left-0 z-10 mb-1 w-48 rounded-md border border-neutral-200 bg-white py-1 shadow-lg">
          {filtered.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => selectMember(m)}
              className="block w-full px-2 py-1 text-left text-xs text-neutral-700 hover:bg-neutral-50"
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function SendIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

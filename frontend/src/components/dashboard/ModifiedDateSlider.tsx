import { useState } from "react";

// Same value space FilterPanel's old DATE_PRESETS radio buttons used
// ("", "1", "7", "30" = days-ago, "" = Any time), extended with a couple
// more steps for a wider draggable range.
const STEPS: { value: string; label: string }[] = [
  { value: "", label: "Any time" },
  { value: "1", label: "Today" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "365", label: "Last year" },
];

export function ModifiedDateSlider({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const committedIndex = Math.max(
    0,
    STEPS.findIndex((s) => s.value === value),
  );

  // Local, instant-feedback position while dragging — separate from the
  // committed value. On Dashboard, `onChange` triggers a router.push (a
  // server round trip), so calling it on every drag tick fired a flood of
  // concurrent navigations and made the thumb visibly lag/snap back. Here
  // the thumb and label track the drag immediately; the parent only hears
  // about it once, when the drag actually ends.
  const [dragIndex, setDragIndex] = useState(committedIndex);
  // Adjust local state during render rather than in an effect (React's
  // recommended pattern for "reset local state when a prop changes") — an
  // effect here would run one render late, giving the "Clear all" / initial-
  // load case a visible flash of the wrong step before snapping.
  const [prevCommittedIndex, setPrevCommittedIndex] = useState(committedIndex);
  if (committedIndex !== prevCommittedIndex) {
    setPrevCommittedIndex(committedIndex);
    setDragIndex(committedIndex);
  }

  function commit(index: number) {
    setDragIndex(index);
    onChange(STEPS[index].value);
  }

  return (
    <div>
      <p className="mb-2 text-sm text-neutral-700 dark:text-neutral-300">{STEPS[dragIndex].label}</p>
      <input
        type="range"
        min={0}
        max={STEPS.length - 1}
        step={1}
        value={dragIndex}
        onChange={(e) => setDragIndex(Number(e.target.value))}
        onMouseUp={(e) => commit(Number(e.currentTarget.value))}
        onTouchEnd={(e) => commit(Number(e.currentTarget.value))}
        onKeyUp={(e) => commit(Number(e.currentTarget.value))}
        className="w-full accent-[var(--brand-purple)]"
      />
      <div className="mt-1 flex justify-between text-[10px] text-neutral-400 dark:text-neutral-500">
        <span>{STEPS[0].label}</span>
        <span>{STEPS[STEPS.length - 1].label}</span>
      </div>
    </div>
  );
}

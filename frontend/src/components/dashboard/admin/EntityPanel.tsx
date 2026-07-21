"use client";

import { useRef, useState, useTransition } from "react";
import type { Team, Product } from "@/lib/api";
import { DeleteTagModal } from "@/components/dashboard/admin/DeleteTagModal";
import { useToast } from "@/components/ToastProvider";
import { Icon } from "@/components/dashboard/Icon";

export function EntityPanel({
  title,
  items,
  action,
  onDelete,
  placeholder,
  canCreate = true,
}: {
  title: string;
  items: (Team | Product)[];
  action: (formData: FormData) => void;
  onDelete: (id: string) => Promise<{ error?: string }>;
  placeholder: string;
  canCreate?: boolean;
}) {
  const [pendingDelete, setPendingDelete] = useState<(Team | Product) | null>(null);
  const [isPending, startTransition] = useTransition();
  const { show } = useToast();
  const formRef = useRef<HTMLFormElement>(null);

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const name = formData.get("name");
    startTransition(async () => {
      try {
        await action(formData);
        show(`"${name}" added.`);
        formRef.current?.reset();
      } catch (err) {
        show(err instanceof Error ? err.message : `Failed to add "${name}".`, "error");
      }
    });
  }

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="mb-3 text-sm font-semibold text-neutral-900">{title}</h2>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {items.map((it) => (
          <span
            key={it.id}
            title={`${it.documentCount} doc${it.documentCount === 1 ? "" : "s"}`}
            className="group relative flex items-center gap-1 rounded-full bg-neutral-100 py-1 pr-1.5 pl-2.5 text-xs text-neutral-600"
          >
            {it.name}
            {canCreate && it.name !== "Others" && (
              <button
                type="button"
                onClick={() => setPendingDelete(it)}
                aria-label={`Remove ${it.name}`}
                className="flex h-3.5 w-3.5 items-center justify-center rounded-full text-neutral-400 opacity-0 transition-opacity group-hover:opacity-100 hover:bg-neutral-300 hover:text-neutral-700"
              >
                <Icon name="Menu/Close_SM" size={9} />
              </button>
            )}
          </span>
        ))}
        {items.length === 0 && <span className="text-xs text-neutral-400">None yet.</span>}
      </div>
      {canCreate ? (
        <form ref={formRef} onSubmit={handleSubmit} className="flex gap-2">
          <input
            name="name"
            placeholder={placeholder}
            required
            disabled={isPending}
            className="flex-1 rounded-md border border-neutral-300 px-3 py-1.5 text-sm focus:border-neutral-400 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--brand-purple)" }}
          >
            {isPending ? "Adding…" : "Add"}
          </button>
        </form>
      ) : (
        <p className="text-xs text-neutral-400">Only a global Admin or Super Admin can create new {title.toLowerCase()}.</p>
      )}

      {pendingDelete && (
        <DeleteTagModal
          label={pendingDelete.name}
          documentCount={pendingDelete.documentCount}
          onConfirm={() => onDelete(pendingDelete.id)}
          onClose={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}


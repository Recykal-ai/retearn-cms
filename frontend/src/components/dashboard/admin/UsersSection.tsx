"use client";

import { useState, useTransition } from "react";
import type { AppUser, Team, Product, Role } from "@/lib/api";
import { relativeTime } from "@/lib/relative-time";
import {
  setUserRoleAction,
  setUserActiveAction,
  setAdminScopeAction,
  inviteUserAction,
} from "@/app/dashboard/admin/admin-actions";

const ROLE_STYLE: Record<AppUser["role"], { bg: string; fg: string }> = {
  SUPER_ADMIN: { bg: "var(--brand-purple-tint)", fg: "var(--brand-purple)" },
  ADMIN: { bg: "#eaf6ec", fg: "#2e7d3f" },
  USER: { bg: "#f5f5f5", fg: "#525252" },
};

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  USER: "User",
};

const RECYKAL_EMAIL_RE = /^[^\s@]+@recykal\.com$/i;

export function UsersSection({
  users,
  teams,
  products,
}: {
  users: AppUser[];
  teams: Team[];
  products: Product[];
}) {
  const [query, setQuery] = useState("");
  const [grantTarget, setGrantTarget] = useState<
    { kind: "promote"; userId: string; userName: string } | { kind: "invite"; email: string } | null
  >(null);

  const trimmed = query.trim();
  const filtered = trimmed
    ? users.filter(
        (u) => u.name.toLowerCase().includes(trimmed.toLowerCase()) || u.email.toLowerCase().includes(trimmed.toLowerCase()),
      )
    : users;

  const looksLikeNewInvite =
    RECYKAL_EMAIL_RE.test(trimmed) && !users.some((u) => u.email.toLowerCase() === trimmed.toLowerCase());

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5">
      <h2 className="mb-1 text-sm font-semibold text-neutral-900">Access</h2>
      <p className="mb-4 text-xs text-neutral-400">
        Anyone who has signed in shows up here automatically. Search by name or email — or type someone&apos;s
        full @recykal.com address to grant them access before they&apos;ve ever signed in.
      </p>

      <div className="relative mb-4 max-w-sm">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-neutral-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search people, or type an email…"
          className="w-full rounded-md border border-neutral-200 py-1.5 pr-3 pl-8 text-sm text-neutral-700 placeholder:text-neutral-400 focus:border-neutral-300 focus:outline-none"
        />
      </div>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-neutral-100 text-xs font-semibold text-neutral-500">
            <th className="min-w-40 py-2.5 pr-4 font-semibold">Name</th>
            <th className="py-2.5 pr-4 font-semibold">Email</th>
            <th className="w-36 py-2.5 pr-4 font-semibold">Role</th>
            <th className="w-48 py-2.5 pr-4 font-semibold">Access</th>
            <th className="w-24 py-2.5 pr-4 font-semibold">Joined</th>
            <th className="w-64 py-2.5 font-normal" />
          </tr>
        </thead>
        <tbody>
          {filtered.map((u) => {
            const style = ROLE_STYLE[u.role];
            return (
              <tr key={u.id} className="border-b border-neutral-50 last:border-0">
                <td className="min-w-40 py-2.5 pr-4 font-medium text-neutral-800 whitespace-nowrap">{u.name}</td>
                <td className="py-2.5 pr-4 text-neutral-500">{u.email}</td>
                <td className="w-36 py-2.5 pr-4">
                  <span
                    className="inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium"
                    style={{ background: style.bg, color: style.fg }}
                  >
                    {u.role.replace("_", " ")}
                  </span>
                </td>
                <td className="w-48 py-2.5 pr-4">
                  {u.role === "ADMIN" && <ScopeSummary user={u} />}
                  {u.role !== "ADMIN" && <span className="text-xs text-neutral-300">—</span>}
                </td>
                <td className="w-24 py-2.5 pr-4 text-neutral-500" suppressHydrationWarning>
                  {relativeTime(u.createdAt)}
                </td>
                <td className="w-64 py-2.5">
                  <div className="flex items-center justify-end gap-2">
                    {u.role === "ADMIN" && <ScopeButton user={u} teams={teams} products={products} />}
                    <RoleSelect
                      userId={u.id}
                      userName={u.name}
                      currentRole={u.role}
                      onRequestPromote={() => setGrantTarget({ kind: "promote", userId: u.id, userName: u.name })}
                    />
                    <RemoveUserButton userId={u.id} userName={u.name} />
                  </div>
                </td>
              </tr>
            );
          })}
          {filtered.length === 0 && !looksLikeNewInvite && (
            <tr>
              <td colSpan={6} className="py-6 text-center text-sm text-neutral-400">
                No matches for &ldquo;{query}&rdquo;.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {looksLikeNewInvite && (
        <div className="mt-3 flex items-center justify-between rounded-md border border-dashed border-neutral-300 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-neutral-700">{trimmed}</p>
            <p className="text-xs text-neutral-400">Hasn&apos;t signed in yet — grant them access now.</p>
          </div>
          <button
            type="button"
            onClick={() => setGrantTarget({ kind: "invite", email: trimmed })}
            className="rounded-md px-3 py-1.5 text-xs font-semibold text-white"
            style={{ background: "var(--brand-purple)" }}
          >
            Make Admin
          </button>
        </div>
      )}

      {grantTarget && (
        <GrantAccessModal
          target={grantTarget}
          teams={teams}
          products={products}
          onClose={() => setGrantTarget(null)}
        />
      )}
    </div>
  );
}

function ScopeSummary({ user }: { user: AppUser }) {
  if (!user.adminScope) {
    return (
      <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs font-medium text-neutral-600">Global</span>
    );
  }
  const names = user.adminScope.map((s) => s.teamName ?? s.productName).filter(Boolean);
  return (
    <div className="flex flex-wrap gap-1">
      {names.map((n) => (
        <span key={n} className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600">
          {n}
        </span>
      ))}
    </div>
  );
}

function RoleSelect({
  userId,
  userName,
  currentRole,
  onRequestPromote,
}: {
  userId: string;
  userName: string;
  currentRole: Role;
  onRequestPromote: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [pendingRole, setPendingRole] = useState<Role | null>(null);

  function apply(role: Role) {
    startTransition(async () => {
      await setUserRoleAction(userId, role);
    });
  }

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const next = e.target.value as Role;
    if (next === currentRole) return;

    // Promoting a plain User to Admin gets the combined role+scope flow so
    // "Admin for just the AI team" can be set in the same step, not a
    // follow-up "Manage access" click.
    if (currentRole === "USER" && next === "ADMIN") {
      onRequestPromote();
      return;
    }
    // Anything touching the Super Admin tier gets a confirmation step —
    // not a lockout guard, just a pause before an unrecoverable-via-UI change.
    if (next === "SUPER_ADMIN" || currentRole === "SUPER_ADMIN") {
      setPendingRole(next);
    } else {
      apply(next);
    }
  }

  return (
    <>
      <select
        value={currentRole}
        onChange={handleChange}
        disabled={isPending}
        className="rounded-md border border-neutral-200 bg-white px-2 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50 disabled:opacity-60"
      >
        <option value="SUPER_ADMIN">Super Admin</option>
        <option value="ADMIN">Admin</option>
        <option value="USER">User</option>
      </select>
      {pendingRole && (
        <RoleChangeConfirm
          userName={userName}
          toRole={pendingRole}
          onConfirm={() => {
            apply(pendingRole);
            setPendingRole(null);
          }}
          onClose={() => setPendingRole(null)}
        />
      )}
    </>
  );
}

function RoleChangeConfirm({
  userName,
  toRole,
  onConfirm,
  onClose,
}: {
  userName: string;
  toRole: Role;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      style={{ fontFamily: "var(--font-ui)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
        <h1 className="mb-2 text-lg font-semibold text-neutral-900">
          Change {userName}&apos;s role to {ROLE_LABEL[toRole]}?
        </h1>
        <p className="mb-5 text-sm text-neutral-500">
          {toRole === "SUPER_ADMIN"
            ? "Super Admin has unrestricted access to everything — every team, product, and Admin's permissions."
            : `This removes ${userName}'s Super Admin access. If they're the only Super Admin, there will be no one left who can grant it back through this app — recovering it would need a direct database change.`}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
            style={{ background: "var(--brand-purple)" }}
          >
            Change role
          </button>
        </div>
      </div>
    </div>
  );
}

function RemoveUserButton({ userId, userName }: { userId: string; userName: string }) {
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);

  function apply() {
    startTransition(async () => {
      await setUserActiveAction(userId, false);
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => setConfirming(true)}
        className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
      >
        Remove
      </button>
      {confirming && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
          style={{ fontFamily: "var(--font-ui)" }}
          onClick={(e) => e.target === e.currentTarget && setConfirming(false)}
        >
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <h1 className="mb-2 text-lg font-semibold text-neutral-900">Remove {userName}?</h1>
            <p className="mb-5 text-sm text-neutral-500">
              They&apos;ll be signed out and disappear from this list. Signing back in with Google restores
              their access immediately — there&apos;s no restriction on that.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  apply();
                  setConfirming(false);
                }}
                className="rounded-md px-3 py-1.5 text-sm font-semibold text-white"
                style={{ background: "#b3342c" }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function ScopeButton({ user, teams, products }: { user: AppUser; teams: Team[]; products: Product[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-600 hover:bg-neutral-50"
      >
        Manage access
      </button>
      {open && <ScopeModal user={user} teams={teams} products={products} onClose={() => setOpen(false)} />}
    </>
  );
}

function ScopeModal({
  user,
  teams,
  products,
  onClose,
}: {
  user: AppUser;
  teams: Team[];
  products: Product[];
  onClose: () => void;
}) {
  const [isGlobal, setIsGlobal] = useState(user.adminScope === null);
  const [teamIds, setTeamIds] = useState<string[]>(
    user.adminScope?.filter((s) => s.teamId).map((s) => s.teamId as string) ?? [],
  );
  const [productIds, setProductIds] = useState<string[]>(
    user.adminScope?.filter((s) => s.productId).map((s) => s.productId as string) ?? [],
  );
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((v) => v !== id) : [...list, id]);
  }

  function handleSave() {
    startTransition(async () => {
      const result = await setAdminScopeAction(user.id, isGlobal ? [] : teamIds, isGlobal ? [] : productIds);
      if (result.error) {
        setError(result.error);
        return;
      }
      onClose();
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      style={{ fontFamily: "var(--font-ui)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-900">Manage access</h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-xl leading-none text-neutral-400 hover:text-neutral-600"
          >
            ×
          </button>
        </div>
        <p className="mb-5 text-xs text-neutral-400">{user.name}</p>

        <ScopePicker
          isGlobal={isGlobal}
          setIsGlobal={setIsGlobal}
          teams={teams}
          products={products}
          teamIds={teamIds}
          productIds={productIds}
          toggleTeam={(id) => toggle(teamIds, setTeamIds, id)}
          toggleProduct={(id) => toggle(productIds, setProductIds, id)}
        />

        {error && <p className="mb-3 text-xs font-medium text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isPending || (!isGlobal && teamIds.length === 0 && productIds.length === 0)}
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--brand-purple)" }}
          >
            {isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// Shared Global/Scoped radio + team/product checkbox picker, used both when
// re-scoping an existing Admin and when granting Admin access for the first time.
function ScopePicker({
  isGlobal,
  setIsGlobal,
  teams,
  products,
  teamIds,
  productIds,
  toggleTeam,
  toggleProduct,
}: {
  isGlobal: boolean;
  setIsGlobal: (v: boolean) => void;
  teams: Team[];
  products: Product[];
  teamIds: string[];
  productIds: string[];
  toggleTeam: (id: string) => void;
  toggleProduct: (id: string) => void;
}) {
  return (
    <>
      <div className="mb-4 space-y-2">
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="radio" checked={isGlobal} onChange={() => setIsGlobal(true)} />
          Global — manages every team and product
        </label>
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input type="radio" checked={!isGlobal} onChange={() => setIsGlobal(false)} />
          Scoped — restrict to specific teams/products
        </label>
      </div>

      {!isGlobal && (
        <div className="mb-5 space-y-4 border-t border-neutral-100 pt-4">
          <div>
            <p className="mb-1.5 text-xs font-semibold text-neutral-600">Teams</p>
            <div className="flex flex-wrap gap-1.5">
              {teams.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600"
                >
                  <input type="checkbox" checked={teamIds.includes(t.id)} onChange={() => toggleTeam(t.id)} />
                  {t.name}
                </label>
              ))}
            </div>
          </div>
          {products.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-semibold text-neutral-600">Products</p>
              <div className="flex flex-wrap gap-1.5">
                {products.map((p) => (
                  <label
                    key={p.id}
                    className="flex items-center gap-1.5 rounded-full border border-neutral-200 px-2.5 py-1 text-xs text-neutral-600"
                  >
                    <input
                      type="checkbox"
                      checked={productIds.includes(p.id)}
                      onChange={() => toggleProduct(p.id)}
                    />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}

function GrantAccessModal({
  target,
  teams,
  products,
  onClose,
}: {
  target: { kind: "promote"; userId: string; userName: string } | { kind: "invite"; email: string };
  teams: Team[];
  products: Product[];
  onClose: () => void;
}) {
  const [isGlobal, setIsGlobal] = useState(true);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [productIds, setProductIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  function toggle(list: string[], setList: (v: string[]) => void, id: string) {
    setList(list.includes(id) ? list.filter((v) => v !== id) : [...list, id]);
  }

  function handleGrant() {
    if (!isGlobal && teamIds.length === 0 && productIds.length === 0) {
      setError("Pick at least one team or product, or choose Global.");
      return;
    }
    startTransition(async () => {
      setError("");
      const scopedTeamIds = isGlobal ? [] : teamIds;
      const scopedProductIds = isGlobal ? [] : productIds;

      if (target.kind === "promote") {
        const roleResult = await setUserRoleAction(target.userId, "ADMIN");
        if (roleResult.error) {
          setError(roleResult.error);
          return;
        }
        if (!isGlobal) {
          const scopeResult = await setAdminScopeAction(target.userId, scopedTeamIds, scopedProductIds);
          if (scopeResult.error) {
            setError(scopeResult.error);
            return;
          }
        }
      } else {
        const result = await inviteUserAction(target.email, "ADMIN", scopedTeamIds, scopedProductIds);
        if (result.error) {
          setError(result.error);
          return;
        }
      }
      onClose();
    });
  }

  const name = target.kind === "promote" ? target.userName : target.email;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      style={{ fontFamily: "var(--font-ui)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-1 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-900">Make Admin</h1>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-xl leading-none text-neutral-400 hover:text-neutral-600"
          >
            ×
          </button>
        </div>
        <p className="mb-5 truncate text-xs text-neutral-400">
          {name}
          {target.kind === "invite" && " — hasn't signed in yet; this takes effect the moment they do."}
        </p>

        <ScopePicker
          isGlobal={isGlobal}
          setIsGlobal={setIsGlobal}
          teams={teams}
          products={products}
          teamIds={teamIds}
          productIds={productIds}
          toggleTeam={(id) => toggle(teamIds, setTeamIds, id)}
          toggleProduct={(id) => toggle(productIds, setProductIds, id)}
        />

        {error && <p className="mb-3 text-xs font-medium text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleGrant}
            disabled={isPending}
            className="rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: "var(--brand-purple)" }}
          >
            {isPending ? "Granting…" : "Grant access"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M21 21l-4.3-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

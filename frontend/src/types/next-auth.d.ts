export {};

// v5's callback types (`session`, `jwt`) pull `Session`/`JWT` straight from
// "@auth/core/types" and "@auth/core/jwt" (see @auth/core/index.d.ts) —
// "next-auth" and "next-auth/jwt" only re-export those (`export * from
// "@auth/core/..."`), which isn't enough for declaration merging to reach the
// types actually used by the callbacks, so both are augmented at their real
// source module.
declare module "@auth/core/types" {
  interface Session {
    appToken?: string;
    role?: "SUPER_ADMIN" | "ADMIN" | "USER";
    // Named appUserId, not userId — the `session` callback's parameter type
    // is an intersection that also picks up AdapterSession (database-strategy
    // sessions), which declares a mandatory `userId: string`. Reusing that
    // name here would silently collapse our optional field to non-optional.
    appUserId?: string;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    appToken?: string;
    role?: "SUPER_ADMIN" | "ADMIN" | "USER";
    userId?: string;
  }
}

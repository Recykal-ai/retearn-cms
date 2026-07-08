const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";

export interface Team {
  id: string;
  name: string;
  documentCount: number;
}

export interface Product {
  id: string;
  name: string;
  documentCount: number;
}

export interface Category {
  id: string;
  name: string;
  scope: string;
  documentCount: number;
}

export type DocStatus = "PENDING" | "PUBLISHED" | "REJECTED";
export type DocSourceType = "FILE" | "LINK";

export interface DocumentSummary {
  id: string;
  title: string;
  status: DocStatus;
  rejectionNote: string | null;
  // True for ~48h after a PENDING -> PUBLISHED transition (approval or
  // auto-publish) — computed server-side, not from a raw timestamp, so the
  // client never needs to compare against "now" during render.
  recentlyPublished: boolean;
  // Set while someone has asked an Admin to delete this doc — cleared on
  // either approve-deletion (soft-deleted) or reject-deletion (untouched).
  deletionRequestedAt: string | null;
  sourceType: DocSourceType;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  ownerTeam: { id: string; name: string } | null;
  categories: { id: string; name: string; scope: string }[];
  uploadedBy: { id: string; name: string; email: string };
  products: { id: string; name: string }[];
  pinned: boolean;
}

export interface DeletedDocumentSummary extends DocumentSummary {
  deletedBy: { name: string; email: string; at: string } | null;
}

export interface DeletionRequestSummary extends DocumentSummary {
  deletionRequestNote: string | null;
  deletionRequestedBy: { name: string; email: string } | null;
}

export interface ApprovalsCount {
  pendingUploads: number;
  deletionRequests: number;
}

export type Role = "SUPER_ADMIN" | "ADMIN" | "USER";

export interface AdminScopeEntry {
  teamId: string | null;
  teamName: string | null;
  productId: string | null;
  productName: string | null;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  active: boolean;
  createdAt: string;
  // null = global admin (or not an admin); a non-null array = restricted to
  // exactly these teams/products.
  adminScope: AdminScopeEntry[] | null;
}

export interface Me {
  id: string;
  email: string;
  name: string;
  role: Role;
  adminScope: { teamIds: string[]; productIds: string[] } | null;
}

export interface AuditLogEntry {
  id: string;
  userId: string;
  action: string;
  targetId: string;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string; email: string };
}

export interface ViewUrlResponse {
  url: string;
  sourceType: DocSourceType;
  expiresIn: number | null;
}

export interface DocumentVersionEntry {
  id: string;
  version: number;
  sourceType: DocSourceType;
  s3Key: string | null;
  externalUrl: string | null;
  note: string | null;
  uploadedBy: string;
  createdAt: string;
}

async function backendFetch<T>(
  path: string,
  appToken: string,
  init?: { method?: string; body?: BodyInit; json?: unknown },
): Promise<T> {
  const headers: Record<string, string> = { Authorization: `Bearer ${appToken}` };
  let body = init?.body;
  if (init?.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(init.json);
  }

  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: init?.method ?? "GET",
    headers,
    body,
    cache: "no-store",
  });
  if (!res.ok) {
    const message = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(message.error ?? `${path} failed with ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export function getTeams(appToken: string) {
  return backendFetch<Team[]>("/api/teams", appToken);
}

export function getProducts(appToken: string) {
  return backendFetch<Product[]>("/api/products", appToken);
}

export function getCategories(appToken: string, scope: string) {
  return backendFetch<Category[]>(`/api/categories?scope=${scope}`, appToken);
}

export type SortField = "modified" | "name";
export type SortDir = "asc" | "desc";

export function getDocuments(
  appToken: string,
  params: {
    mode?: "team" | "product";
    entityId?: string;
    category?: string;
    q?: string;
    status?: DocStatus;
    modifiedSince?: string;
    sort?: SortField;
    dir?: SortDir;
  },
) {
  const qs = new URLSearchParams();
  if (params.mode) qs.set("mode", params.mode);
  if (params.entityId) qs.set("entityId", params.entityId);
  if (params.category) qs.set("category", params.category);
  if (params.q) qs.set("q", params.q);
  if (params.status) qs.set("status", params.status);
  if (params.modifiedSince) qs.set("modifiedSince", params.modifiedSince);
  if (params.sort) qs.set("sort", params.sort);
  if (params.dir) qs.set("dir", params.dir);
  return backendFetch<DocumentSummary[]>(`/api/documents?${qs.toString()}`, appToken);
}

export function searchDocuments(appToken: string, q: string) {
  return backendFetch<DocumentSummary[]>(`/api/search?q=${encodeURIComponent(q)}`, appToken);
}

export function getRecentDocuments(appToken: string, limit = 10) {
  return backendFetch<DocumentSummary[]>(`/api/documents/recent?limit=${limit}`, appToken);
}

export function getPinnedDocuments(appToken: string) {
  return backendFetch<DocumentSummary[]>("/api/documents/pinned", appToken);
}

export function pinDocument(appToken: string, id: string) {
  return backendFetch<{ pinned: boolean }>(`/api/documents/${id}/pin`, appToken, { method: "PUT" });
}

export function unpinDocument(appToken: string, id: string) {
  return backendFetch<{ pinned: boolean }>(`/api/documents/${id}/pin`, appToken, { method: "DELETE" });
}

export function getDeletedDocuments(appToken: string) {
  return backendFetch<DeletedDocumentSummary[]>("/api/documents/trash", appToken);
}

export function recoverDocument(appToken: string, id: string) {
  return backendFetch<DocumentSummary>(`/api/documents/${id}/recover`, appToken, { method: "POST" });
}

export function getDocument(appToken: string, id: string) {
  return backendFetch<DocumentSummary & { versions: DocumentVersionEntry[] }>(`/api/documents/${id}`, appToken);
}

export function getViewUrl(appToken: string, id: string) {
  return backendFetch<ViewUrlResponse>(`/api/documents/${id}/view-url`, appToken);
}

export function getVersionViewUrl(appToken: string, id: string, version: number) {
  return backendFetch<ViewUrlResponse>(`/api/documents/${id}/versions/${version}/view-url`, appToken);
}

export function createDocument(appToken: string, formData: FormData) {
  return backendFetch<DocumentSummary>("/api/documents", appToken, { method: "POST", body: formData });
}

export function pushDocumentVersion(appToken: string, id: string, formData: FormData) {
  return backendFetch<DocumentSummary>(`/api/documents/${id}/versions`, appToken, {
    method: "POST",
    body: formData,
  });
}

export function revertToVersion(appToken: string, id: string, version: number) {
  return backendFetch<DocumentSummary>(`/api/documents/${id}/versions/${version}/revert`, appToken, {
    method: "POST",
  });
}

export function updateDocumentTags(
  appToken: string,
  id: string,
  tags: { ownerTeamId: string | null; productIds: string[]; categoryIds: string[] },
) {
  return backendFetch<DocumentSummary>(`/api/documents/${id}/tags`, appToken, {
    method: "PATCH",
    json: tags,
  });
}

export function approveDocument(appToken: string, id: string) {
  return backendFetch<DocumentSummary>(`/api/documents/${id}/approve`, appToken, { method: "PATCH" });
}

export function rejectDocument(appToken: string, id: string, note: string) {
  return backendFetch<DocumentSummary>(`/api/documents/${id}/reject`, appToken, {
    method: "PATCH",
    json: { note },
  });
}

export function deleteDocument(appToken: string, id: string) {
  return backendFetch<void>(`/api/documents/${id}`, appToken, { method: "DELETE" });
}

export function requestDocumentDeletion(appToken: string, id: string, note: string) {
  return backendFetch<DocumentSummary>(`/api/documents/${id}/request-deletion`, appToken, {
    method: "POST",
    json: { note },
  });
}

export function getDeletionRequests(appToken: string) {
  return backendFetch<DeletionRequestSummary[]>("/api/documents/deletion-requests", appToken);
}

export function approveDeletion(appToken: string, id: string) {
  return backendFetch<void>(`/api/documents/${id}/approve-deletion`, appToken, { method: "PATCH" });
}

export function rejectDeletion(appToken: string, id: string) {
  return backendFetch<DocumentSummary>(`/api/documents/${id}/reject-deletion`, appToken, { method: "PATCH" });
}

export function getApprovalsCount(appToken: string) {
  return backendFetch<ApprovalsCount>("/api/documents/approvals-count", appToken);
}

export function createTeam(appToken: string, name: string) {
  return backendFetch<Team>("/api/teams", appToken, { method: "POST", json: { name } });
}

export function createProduct(appToken: string, name: string) {
  return backendFetch<Product>("/api/products", appToken, { method: "POST", json: { name } });
}

export function createCategory(appToken: string, name: string, scope: string) {
  return backendFetch<Category>("/api/categories", appToken, { method: "POST", json: { name, scope } });
}

export function deleteTeam(appToken: string, id: string) {
  return backendFetch<void>(`/api/teams/${id}`, appToken, { method: "DELETE" });
}

export function deleteProduct(appToken: string, id: string) {
  return backendFetch<void>(`/api/products/${id}`, appToken, { method: "DELETE" });
}

export function deleteCategory(appToken: string, id: string) {
  return backendFetch<void>(`/api/categories/${id}`, appToken, { method: "DELETE" });
}

export function getUsers(appToken: string) {
  return backendFetch<AppUser[]>("/api/users", appToken);
}

export function inviteUser(
  appToken: string,
  email: string,
  role: Role,
  teamIds: string[],
  productIds: string[],
) {
  return backendFetch<AppUser>("/api/users", appToken, {
    method: "POST",
    json: { email, role, teamIds, productIds },
  });
}

export function setUserRole(appToken: string, id: string, role: Role) {
  return backendFetch<AppUser>(`/api/users/${id}/role`, appToken, { method: "PATCH", json: { role } });
}

export function setUserActive(appToken: string, id: string, active: boolean) {
  return backendFetch<AppUser>(`/api/users/${id}/active`, appToken, { method: "PATCH", json: { active } });
}

export function setAdminScope(appToken: string, id: string, teamIds: string[], productIds: string[]) {
  return backendFetch<{ ok: true; global: boolean }>(`/api/users/${id}/admin-scope`, appToken, {
    method: "PUT",
    json: { teamIds, productIds },
  });
}

export function getMe(appToken: string) {
  return backendFetch<Me>("/api/auth/me", appToken);
}

export function getAuditLog(appToken: string, limit = 100) {
  return backendFetch<AuditLogEntry[]>(`/api/audit-log?limit=${limit}`, appToken);
}

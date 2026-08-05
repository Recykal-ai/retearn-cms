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
  isGlobal: boolean;
}

export interface GlobalCategorySummary {
  name: string;
  scopeCount: number;
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
  // Who asked — may differ from uploadedBy.id (requesting deletion of a doc
  // you don't own is exactly the case this field exists for).
  deletionRequestedById: string | null;
  // Soft-delete timestamp — only ever populated when fetched via
  // getDocuments' mergeRecent option or getMyDocuments (every other caller
  // excludes deleted docs entirely, so this is null there regardless).
  deletedAt: string | null;
  // True for ~48h after deletedAt is set — same window/computation style as
  // recentlyPublished, see document-serializer.ts.
  recentlyDeleted: boolean;
  // Set when an Admin declines a deletion request on this doc (it stays as
  // it was); cleared on the next fresh deletion request. Only meaningful
  // from getMyDocuments — see MyUploadsTable's "Deletion declined" badge.
  deletionDeclinedAt: string | null;
  sourceType: DocSourceType;
  // Only set when sourceType is LINK — the stored external URL (e.g. a
  // Google Docs/Sheets/Slides or Confluence share link). Used purely for
  // icon selection (see lib/file-type.ts's linkKindOf) — the real signed/
  // external view URL still comes from GET /api/documents/:id/view-url.
  externalUrl: string | null;
  currentVersion: number;
  createdAt: string;
  updatedAt: string;
  ownerTeam: { id: string; name: string } | null;
  categories: { id: string; name: string; scope: string; isGlobal: boolean }[];
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
  emailNotificationsEnabled: boolean;
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
  // Set when a Google Sheets or Docs LINK doc was exported server-side for
  // in-app rendering instead of being opened as a plain external link — see
  // backend's buildLinkViewResponse/getDriveExportTarget. "spreadsheet" for
  // Sheets, "pdf" for Docs (exported to PDF and rendered via the existing
  // pdf.js viewer — docx isn't reused here, LINK docx-equivalent still
  // isn't a thing since Docs links always export as PDF). `externalUrl` is
  // the original share link, kept as a fallback if the export ever fails
  // (access revoked, grant expired, etc.) after the URL was already handed out.
  kind?: "spreadsheet" | "pdf";
  externalUrl?: string;
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

// Not routed through backendFetch — that helper always parses the response
// as JSON, but this endpoint returns raw PDF bytes (see personal-notes.ts /
// team-notes.ts's export-pdf routes).
export async function exportNoteToPdf(appToken: string, noteId: string, noteKind: "personal" | "team"): Promise<ArrayBuffer> {
  const path = noteKind === "personal" ? `/api/personal-notes/${noteId}/export-pdf` : `/api/team-notes/${noteId}/export-pdf`;
  const res = await fetch(`${BACKEND_URL}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${appToken}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const message = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(message.error ?? `${path} failed with ${res.status}`);
  }
  return res.arrayBuffer();
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
    uploadedBy?: string;
    sort?: SortField;
    dir?: SortDir;
    // Opt-in: merge Pending (viewer-scoped) and recently-deleted docs inline
    // alongside Published, instead of the default Published-only list. Only
    // takes effect server-side when status is unset — see documents.ts.
    mergeRecent?: boolean;
  },
) {
  const qs = new URLSearchParams();
  if (params.mode) qs.set("mode", params.mode);
  if (params.entityId) qs.set("entityId", params.entityId);
  if (params.category) qs.set("category", params.category);
  if (params.q) qs.set("q", params.q);
  if (params.status) qs.set("status", params.status);
  if (params.modifiedSince) qs.set("modifiedSince", params.modifiedSince);
  if (params.uploadedBy) qs.set("uploadedBy", params.uploadedBy);
  if (params.sort) qs.set("sort", params.sort);
  if (params.dir) qs.set("dir", params.dir);
  if (params.mergeRecent) qs.set("mergeRecent", "true");
  return backendFetch<DocumentSummary[]>(`/api/documents?${qs.toString()}`, appToken);
}

// Everything relevant to the caller's own approval history — uploads they
// submitted (any status) and deletions they requested (live or historical),
// including soft-deleted docs so a resolved deletion request still shows up
// with its outcome instead of silently disappearing. Backs the non-admin
// Approvals tab (UserSubmissions in approvals/page.tsx).
export function getMyDocuments(appToken: string) {
  return backendFetch<DocumentSummary[]>(`/api/documents/mine`, appToken);
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

// scope: "all" creates the same-named category under every team/product at
// once (unrestricted admins only) rather than a single scoped row — see the
// backend route for why. The response shape differs for that case, but no
// caller currently reads the return value (revalidatePath alone is enough
// to pick up the new tags), so the union is just for accuracy.
export function createCategory(appToken: string, name: string, scope: string) {
  return backendFetch<Category | { global: true; name: string; created: Category[]; skipped: number }>(
    "/api/categories",
    appToken,
    { method: "POST", json: { name, scope } },
  );
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

// One entry per distinct global category name (not one per underlying scope
// row) — for the admin dashboard's Global categories section.
export function getGlobalCategories(appToken: string) {
  return backendFetch<GlobalCategorySummary[]>("/api/categories/global", appToken);
}

export function deleteGlobalCategory(appToken: string, name: string) {
  return backendFetch<void>(`/api/categories/global/${encodeURIComponent(name)}`, appToken, { method: "DELETE" });
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

export function updateMyNotificationPreference(appToken: string, emailNotificationsEnabled: boolean) {
  return backendFetch<{ id: string; emailNotificationsEnabled: boolean }>("/api/users/me", appToken, {
    method: "PATCH",
    json: { emailNotificationsEnabled },
  });
}

export function getAuditLog(appToken: string, limit = 100) {
  return backendFetch<AuditLogEntry[]>(`/api/audit-log?limit=${limit}`, appToken);
}

export interface PersonalNote {
  id: string;
  title: string;
  icon: string | null;
  teamId: string | null;
  team: { id: string; name: string } | null;
  folderId: string | null;
  meetingAt: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalNoteInput {
  title?: string;
  icon?: string | null;
  teamId?: string | null;
  folderId?: string | null;
  meetingAt?: string | null;
  content?: string;
}

// Obsidian-style nested folder, owner-scoped, purely organizational — see
// backend/src/routes/personal-note-folders.ts. A null parentId is a
// root-level folder; the frontend builds the tree from this flat list.
export interface PersonalNoteFolder {
  id: string;
  userId: string;
  name: string;
  icon: string | null;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export function getPersonalNoteFolders(appToken: string) {
  return backendFetch<PersonalNoteFolder[]>("/api/personal-note-folders", appToken);
}

export function createPersonalNoteFolder(
  appToken: string,
  input: { name: string; icon?: string | null; parentId?: string | null },
) {
  return backendFetch<PersonalNoteFolder>("/api/personal-note-folders", appToken, { method: "POST", json: input });
}

export function updatePersonalNoteFolder(
  appToken: string,
  id: string,
  input: { name?: string; icon?: string | null; parentId?: string | null },
) {
  return backendFetch<PersonalNoteFolder>(`/api/personal-note-folders/${id}`, appToken, {
    method: "PATCH",
    json: input,
  });
}

export function deletePersonalNoteFolder(appToken: string, id: string) {
  return backendFetch<void>(`/api/personal-note-folders/${id}`, appToken, { method: "DELETE" });
}

export function getPersonalNotes(appToken: string) {
  return backendFetch<PersonalNote[]>("/api/personal-notes", appToken);
}

export function getPersonalNote(appToken: string, id: string) {
  return backendFetch<PersonalNote>(`/api/personal-notes/${id}`, appToken);
}

export function createPersonalNote(appToken: string, input: PersonalNoteInput) {
  return backendFetch<PersonalNote>("/api/personal-notes", appToken, { method: "POST", json: input });
}

export function updatePersonalNote(appToken: string, id: string, input: PersonalNoteInput) {
  return backendFetch<PersonalNote>(`/api/personal-notes/${id}`, appToken, { method: "PATCH", json: input });
}

export function deletePersonalNote(appToken: string, id: string) {
  return backendFetch<void>(`/api/personal-notes/${id}`, appToken, { method: "DELETE" });
}

// A team can have many titled notes now (not one shared page) — each with
// its own membership, picked at creation time.
export interface TeamNoteSummary {
  id: string;
  teamId: string;
  teamName: string;
  title: string;
  icon: string | null;
  folderId: string | null;
  meetingAt: string | null;
  updatedAt: string;
}

export interface TeamNoteMember {
  id: string;
  name: string;
  email: string;
  addedAt: string;
}

export interface TeamNoteDetail {
  id: string;
  teamId: string;
  teamName: string;
  title: string;
  icon: string | null;
  folderId: string | null;
  meetingAt: string | null;
  content: string;
  updatedAt: string;
  canCurate: boolean;
  createdBy: { id: string; name: string };
  members: TeamNoteMember[];
}

export interface CandidateUser {
  id: string;
  name: string;
  email: string;
}

export interface CreatableTeam {
  id: string;
  name: string;
}

export function getTeamNotesList(appToken: string) {
  return backendFetch<TeamNoteSummary[]>("/api/team-notes", appToken);
}

export function getCreatableTeams(appToken: string) {
  return backendFetch<CreatableTeam[]>("/api/team-notes/creatable-teams", appToken);
}

export function createTeamNote(
  appToken: string,
  input: {
    teamId: string;
    title: string;
    icon?: string | null;
    folderId?: string | null;
    meetingAt?: string | null;
    memberIds: string[];
  },
) {
  return backendFetch<{
    id: string;
    teamId: string;
    title: string;
    icon: string | null;
    folderId: string | null;
    meetingAt: string | null;
  }>("/api/team-notes", appToken, { method: "POST", json: input });
}

export function getTeamNote(appToken: string, id: string) {
  return backendFetch<TeamNoteDetail>(`/api/team-notes/${id}`, appToken);
}

export function updateTeamNote(
  appToken: string,
  id: string,
  input: { title?: string; icon?: string | null; folderId?: string | null; meetingAt?: string | null; content?: string },
) {
  return backendFetch<{
    id: string;
    title: string;
    icon: string | null;
    folderId: string | null;
    meetingAt: string | null;
    content: string;
    updatedAt: string;
  }>(`/api/team-notes/${id}`, appToken, { method: "PUT", json: input });
}

export function deleteTeamNote(appToken: string, id: string) {
  return backendFetch<void>(`/api/team-notes/${id}`, appToken, { method: "DELETE" });
}

// Obsidian-style nested folder scoped to one Team — see
// backend/src/routes/team-note-folders.ts. Creating/renaming/deleting is
// admin-curator-only; any member with note access can still see the tree.
export interface TeamNoteFolder {
  id: string;
  teamId: string;
  name: string;
  icon: string | null;
  parentId: string | null;
  createdById: string;
  createdAt: string;
  updatedAt: string;
}

export function getTeamNoteFolders(appToken: string) {
  return backendFetch<TeamNoteFolder[]>("/api/team-note-folders", appToken);
}

export function createTeamNoteFolder(
  appToken: string,
  input: { teamId: string; name: string; icon?: string | null; parentId?: string | null },
) {
  return backendFetch<TeamNoteFolder>("/api/team-note-folders", appToken, { method: "POST", json: input });
}

export function updateTeamNoteFolder(
  appToken: string,
  id: string,
  input: { name?: string; icon?: string | null; parentId?: string | null },
) {
  return backendFetch<TeamNoteFolder>(`/api/team-note-folders/${id}`, appToken, { method: "PATCH", json: input });
}

export function deleteTeamNoteFolder(appToken: string, id: string) {
  return backendFetch<void>(`/api/team-note-folders/${id}`, appToken, { method: "DELETE" });
}

export function addTeamNoteMember(appToken: string, id: string, userId: string) {
  return backendFetch<TeamNoteMember>(`/api/team-notes/${id}/members`, appToken, {
    method: "POST",
    json: { userId },
  });
}

export function removeTeamNoteMember(appToken: string, id: string, userId: string) {
  return backendFetch<void>(`/api/team-notes/${id}/members/${userId}`, appToken, { method: "DELETE" });
}

export function searchCandidateUsers(appToken: string, id: string, q: string) {
  return backendFetch<CandidateUser[]>(`/api/team-notes/${id}/candidate-users?q=${encodeURIComponent(q)}`, appToken);
}

// Creation-time candidate search — no note id exists yet, gated by teamId instead.
export function searchCandidateUsersForTeam(appToken: string, teamId: string, q: string) {
  return backendFetch<CandidateUser[]>(
    `/api/team-notes/candidate-users?teamId=${teamId}&q=${encodeURIComponent(q)}`,
    appToken,
  );
}

// One entry in a team note's "Update history" — see TeamNoteActivityAction
// in schema.prisma for the full action list. anchorId, when present, is
// what RichTextEditor's scrollToAnchor jumps to (an image key, a linked
// document's id, or a comment thread's root comment id).
export interface TeamNoteActivityEntry {
  id: string;
  action:
    | "EDITED_DETAILS"
    | "ADDED_IMAGE"
    | "LINKED_DOCUMENT"
    | "ADDED_COMMENT"
    | "RESOLVED_COMMENT"
    | "REOPENED_COMMENT"
    | "EDITED_CONTENT";
  anchorId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  user: { id: string; name: string };
}

export function getTeamNoteActivity(appToken: string, id: string) {
  return backendFetch<TeamNoteActivityEntry[]>(`/api/team-notes/${id}/activity`, appToken);
}

export interface TeamNoteCommentEntry {
  id: string;
  teamNoteId: string;
  parentId: string | null;
  quotedText: string;
  body: string;
  author: { id: string; name: string };
  resolved: boolean;
  resolvedBy: { id: string; name: string } | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function getTeamNoteComments(appToken: string, id: string) {
  return backendFetch<TeamNoteCommentEntry[]>(`/api/team-notes/${id}/comments`, appToken);
}

export function addTeamNoteComment(
  appToken: string,
  id: string,
  input: { quotedText: string; body: string; parentId?: string; mentionedUserIds?: string[] },
) {
  return backendFetch<TeamNoteCommentEntry>(`/api/team-notes/${id}/comments`, appToken, { method: "POST", json: input });
}

export function editTeamNoteComment(appToken: string, id: string, commentId: string, body: string) {
  return backendFetch<TeamNoteCommentEntry>(`/api/team-notes/${id}/comments/${commentId}`, appToken, {
    method: "PATCH",
    json: { body },
  });
}

export function resolveTeamNoteComment(appToken: string, id: string, commentId: string, resolved: boolean) {
  return backendFetch<TeamNoteCommentEntry>(`/api/team-notes/${id}/comments/${commentId}/resolve`, appToken, {
    method: "PATCH",
    json: { resolved },
  });
}

export function deleteTeamNoteComment(appToken: string, id: string, commentId: string) {
  return backendFetch<void>(`/api/team-notes/${id}/comments/${commentId}`, appToken, { method: "DELETE" });
}

export type NotificationType = "MENTION" | "DOCUMENT_APPROVED" | "DOCUMENT_REJECTED" | "DELETION_APPROVED" | "DELETION_REJECTED";

// Polymorphic — a MENTION row has teamNoteId/noteTitle/teamName (and
// optionally commentId) set; a document-outcome row has documentId/
// documentTitle set instead. Exactly one side is non-null per `type`.
export interface NotificationEntry {
  id: string;
  type: NotificationType;
  teamNoteId: string | null;
  noteTitle: string | null;
  teamName: string | null;
  commentId: string | null;
  documentId: string | null;
  documentTitle: string | null;
  triggeredBy: { id: string; name: string };
  read: boolean;
  createdAt: string;
}

export function getNotifications(appToken: string, limit = 20) {
  return backendFetch<NotificationEntry[]>(`/api/notifications?limit=${limit}`, appToken);
}

export function getUnreadNotificationsCount(appToken: string) {
  return backendFetch<{ count: number }>("/api/notifications/unread-count", appToken);
}

export function markNotificationRead(appToken: string, id: string) {
  return backendFetch<{ ok: true }>(`/api/notifications/${id}/read`, appToken, { method: "POST" });
}

export function markAllNotificationsRead(appToken: string) {
  return backendFetch<{ ok: true }>("/api/notifications/read-all", appToken, { method: "POST" });
}

export function markTeamNoteNotificationsRead(appToken: string, teamNoteId: string) {
  return backendFetch<{ ok: true }>(`/api/notifications/team-note/${teamNoteId}/read`, appToken, { method: "POST" });
}

// Uploading returns only a storage key, never a URL — a signed URL would
// expire long before the note itself does. The editor re-resolves a fresh
// one via getNoteImageViewUrl every time the image renders (see
// NoteImageExtension.tsx), same pattern as embedding an existing document.
export function uploadNoteImage(appToken: string, formData: FormData) {
  return backendFetch<{ key: string }>("/api/note-images", appToken, { method: "POST", body: formData });
}

export function getNoteImageViewUrl(appToken: string, key: string) {
  return backendFetch<{ url: string; expiresIn: number }>(
    `/api/note-images/view-url?key=${encodeURIComponent(key)}`,
    appToken,
  );
}

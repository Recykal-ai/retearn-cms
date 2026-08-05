"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  createDocument,
  pushDocumentVersion,
  revertToVersion,
  updateDocumentTags,
  approveDocument,
  rejectDocument,
  deleteDocument,
  requestDocumentDeletion,
  getDeletionRequests,
  approveDeletion,
  rejectDeletion,
  getApprovalsCount,
  getViewUrl,
  getVersionViewUrl,
  getDocument,
  getTeams,
  getProducts,
  getCategories,
  getPinnedDocuments,
  pinDocument,
  unpinDocument,
  getDocuments,
  type Category,
  type DocumentSummary,
} from "@/lib/api";

async function requireSession() {
  const session = await auth();
  if (!session?.appToken) {
    throw new Error("Not signed in");
  }
  return session;
}

export async function uploadDocumentAction(formData: FormData) {
  const session = await requireSession();
  const ownerTeamId = formData.get("ownerTeamId");
  const productIds: string[] = JSON.parse((formData.get("productIds") as string) || "[]");

  // Everyone lands back on the dashboard, at whichever team/product the doc
  // was tagged to — never forced onto the Approvals page. A non-admin still
  // finds out their upload needs review, just via the toast's "Check here"
  // link (see FlashToast.tsx) rather than being redirected there outright.
  const isAdmin = session.role === "ADMIN" || session.role === "SUPER_ADMIN";
  const destination = ownerTeamId
    ? `/dashboard?mode=team&entity=${ownerTeamId}`
    : productIds[0]
      ? `/dashboard?mode=product&entity=${productIds[0]}`
      : "/dashboard";

  let flash = isAdmin ? "upload_published" : "upload_pending";
  try {
    await createDocument(session.appToken!, formData);
  } catch {
    flash = "upload_error";
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/approvals");
  redirect(`${destination}${destination.includes("?") ? "&" : "?"}flash=${flash}`);
}

export async function pushVersionAction(documentId: string, formData: FormData) {
  const session = await requireSession();
  await pushDocumentVersion(session.appToken!, documentId, formData);
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/approvals");
}

export async function revertVersionAction(
  documentId: string,
  version: number,
): Promise<{ error?: string; status?: DocumentSummary["status"] }> {
  const session = await requireSession();
  let status: DocumentSummary["status"];
  try {
    const updated = await revertToVersion(session.appToken!, documentId, version);
    status = updated.status;
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to revert to that version" };
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/approvals");
  return { status };
}

export async function updateDocumentTagsAction(
  documentId: string,
  tags: { ownerTeamId: string | null; productIds: string[]; categoryIds: string[] },
): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await updateDocumentTags(session.appToken!, documentId, tags);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update tags" };
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/approvals");
  return {};
}

// Backs the @ menu's document picker (RichTextEditor.tsx / AtMentionMenu.tsx)
// — same filters the main dashboard's own document list uses (mode/entityId
// for a Team/Product browse, category to narrow within it, q for a title
// search), just reused from inside a note editor instead of a page. Defaults
// to PUBLISHED-only like every other browse view — referencing a doc that
// hasn't cleared review yet isn't the point of this picker.
export async function searchDocumentsForEmbedAction(params: {
  mode?: "team" | "product";
  entityId?: string;
  category?: string;
  q?: string;
}): Promise<DocumentSummary[]> {
  const session = await requireSession();
  return getDocuments(session.appToken!, params);
}

export async function getTagCatalogAction(): Promise<{
  teams: Awaited<ReturnType<typeof getTeams>>;
  products: Awaited<ReturnType<typeof getProducts>>;
  categoriesByScope: Record<string, Category[]>;
}> {
  const session = await requireSession();
  const appToken = session.appToken!;
  const [teams, products] = await Promise.all([getTeams(appToken), getProducts(appToken)]);
  const allEntities = [...teams, ...products];
  const categoryLists = await Promise.all(allEntities.map((e) => getCategories(appToken, e.id)));
  const categoriesByScope: Record<string, Category[]> = {};
  allEntities.forEach((e, i) => {
    categoriesByScope[e.id] = categoryLists[i];
  });
  return { teams, products, categoriesByScope };
}

export async function approveDocumentsAction(documentIds: string[]): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await Promise.all(documentIds.map((id) => approveDocument(session.appToken!, id)));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to approve" };
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/approvals");
  return {};
}

export async function rejectDocumentsAction(documentIds: string[], note: string): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await Promise.all(documentIds.map((id) => rejectDocument(session.appToken!, id, note)));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to reject" };
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/approvals");
  return {};
}

export async function deleteDocumentAction(documentId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await deleteDocument(session.appToken!, documentId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete" };
  }
  revalidatePath("/dashboard");
  return {};
}

export async function requestDeletionAction(documentId: string, note: string): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await requestDocumentDeletion(session.appToken!, documentId, note);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to request deletion" };
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/approvals");
  return {};
}

export async function getDeletionRequestsAction() {
  const session = await requireSession();
  return getDeletionRequests(session.appToken!);
}

export async function approveDeletionsAction(documentIds: string[]): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await Promise.all(documentIds.map((id) => approveDeletion(session.appToken!, id)));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to approve deletion" };
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/recycle-bin");
  return {};
}

export async function rejectDeletionsAction(documentIds: string[]): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await Promise.all(documentIds.map((id) => rejectDeletion(session.appToken!, id)));
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to reject deletion request" };
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/approvals");
  return {};
}

export async function getApprovalsCountAction(): Promise<{ pendingUploads: number; deletionRequests: number }> {
  const session = await requireSession();
  if (session.role !== "ADMIN" && session.role !== "SUPER_ADMIN") {
    return { pendingUploads: 0, deletionRequests: 0 };
  }
  return getApprovalsCount(session.appToken!);
}

export async function getViewUrlAction(documentId: string) {
  const session = await requireSession();
  return getViewUrl(session.appToken!, documentId);
}

export async function getVersionViewUrlAction(documentId: string, version: number) {
  const session = await requireSession();
  return getVersionViewUrl(session.appToken!, documentId, version);
}

export async function getDocumentVersionsAction(documentId: string) {
  const session = await requireSession();
  const doc = await getDocument(session.appToken!, documentId);
  return doc.versions;
}

// Backs the "open a shared document link" flow (?doc=<id> on the dashboard —
// see AutoOpenDocument.tsx) — needs just enough of the doc to open the
// viewer (id, title, sourceType); returns the full summary since that's what
// getDocument already gives us.
export async function getDocumentAction(documentId: string): Promise<DocumentSummary> {
  const session = await requireSession();
  return getDocument(session.appToken!, documentId);
}

export async function getPinnedDocumentsAction() {
  const session = await requireSession();
  return getPinnedDocuments(session.appToken!);
}

export async function setPinnedAction(documentId: string, pinned: boolean): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    if (pinned) {
      await pinDocument(session.appToken!, documentId);
    } else {
      await unpinDocument(session.appToken!, documentId);
    }
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update pin" };
  }
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/approvals");
  revalidatePath("/dashboard/search");
  return {};
}

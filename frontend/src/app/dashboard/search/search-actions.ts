"use server";

import { auth } from "@/auth";
import { searchDocuments, type DocumentSummary } from "@/lib/api";

export async function searchDocumentsAction(q: string): Promise<DocumentSummary[]> {
  const session = await auth();
  if (!session?.appToken || !q.trim()) return [];
  return searchDocuments(session.appToken, q.trim());
}

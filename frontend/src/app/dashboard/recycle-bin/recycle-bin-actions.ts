"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { recoverDocument } from "@/lib/api";

async function requireSession() {
  const session = await auth();
  if (!session?.appToken) {
    throw new Error("Not signed in");
  }
  return session;
}

export async function recoverDocumentAction(documentId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await recoverDocument(session.appToken!, documentId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to recover document" };
  }
  revalidatePath("/dashboard/recycle-bin");
  revalidatePath("/dashboard");
  return {};
}

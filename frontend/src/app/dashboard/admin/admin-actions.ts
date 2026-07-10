"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  createTeam,
  createProduct,
  createCategory,
  deleteTeam,
  deleteProduct,
  deleteCategory,
  deleteGlobalCategory,
  setUserRole,
  setUserActive,
  setAdminScope,
  inviteUser,
  type Role,
} from "@/lib/api";

async function requireSession() {
  const session = await auth();
  if (!session?.appToken) {
    throw new Error("Not signed in");
  }
  return session;
}

export async function createTeamAction(formData: FormData) {
  const session = await requireSession();
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;
  await createTeam(session.appToken!, name);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
}

export async function createProductAction(formData: FormData) {
  const session = await requireSession();
  const name = (formData.get("name") as string)?.trim();
  if (!name) return;
  await createProduct(session.appToken!, name);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
}

export async function createCategoryAction(formData: FormData) {
  const session = await requireSession();
  const name = (formData.get("name") as string)?.trim();
  const scope = formData.get("scope") as string;
  if (!name || !scope) return;
  await createCategory(session.appToken!, name, scope);
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
}

export async function deleteTeamAction(id: string): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await deleteTeam(session.appToken!, id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete team" };
  }
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
  return {};
}

export async function deleteProductAction(id: string): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await deleteProduct(session.appToken!, id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete product" };
  }
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
  return {};
}

export async function deleteCategoryAction(id: string): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await deleteCategory(session.appToken!, id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete tag" };
  }
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
  return {};
}

export async function deleteGlobalCategoryAction(name: string): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await deleteGlobalCategory(session.appToken!, name);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete global tag" };
  }
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard");
  return {};
}

export async function setUserRoleAction(userId: string, role: Role): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await setUserRole(session.appToken!, userId, role);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update role" };
  }
  revalidatePath("/dashboard/admin");
  return {};
}

export async function setUserActiveAction(userId: string, active: boolean): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await setUserActive(session.appToken!, userId, active);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update account status" };
  }
  revalidatePath("/dashboard/admin");
  return {};
}

export async function setAdminScopeAction(
  userId: string,
  teamIds: string[],
  productIds: string[],
): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await setAdminScope(session.appToken!, userId, teamIds, productIds);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update access" };
  }
  revalidatePath("/dashboard/admin");
  return {};
}

export async function inviteUserAction(
  email: string,
  role: Role,
  teamIds: string[],
  productIds: string[],
): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await inviteUser(session.appToken!, email, role, teamIds, productIds);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to grant access" };
  }
  revalidatePath("/dashboard/admin");
  return {};
}

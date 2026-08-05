"use server";

import { auth } from "@/auth";
import { getMe, updateMyNotificationPreference } from "@/lib/api";

async function requireSession() {
  const session = await auth();
  if (!session?.appToken) {
    throw new Error("Not signed in");
  }
  return session;
}

export async function getMyNotificationPreferenceAction(): Promise<{ emailNotificationsEnabled?: boolean; error?: string }> {
  const session = await requireSession();
  try {
    const me = await getMe(session.appToken!);
    return { emailNotificationsEnabled: me.emailNotificationsEnabled };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to load notification settings" };
  }
}

export async function updateMyNotificationPreferenceAction(emailNotificationsEnabled: boolean): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await updateMyNotificationPreference(session.appToken!, emailNotificationsEnabled);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update notification settings" };
  }
  return {};
}

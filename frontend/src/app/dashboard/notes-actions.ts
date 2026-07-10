"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  getPersonalNotes,
  getPersonalNote,
  createPersonalNote,
  updatePersonalNote,
  deletePersonalNote,
  getTeamNotesList,
  getCreatableTeams,
  createTeamNote,
  getTeamNote,
  updateTeamNote,
  addTeamNoteMember,
  removeTeamNoteMember,
  searchCandidateUsers,
  searchCandidateUsersForTeam,
  getNotifications,
  getUnreadNotificationsCount,
  markNotificationRead,
  type PersonalNoteInput,
} from "@/lib/api";

async function requireSession() {
  const session = await auth();
  if (!session?.appToken) {
    throw new Error("Not signed in");
  }
  return session;
}

export async function getPersonalNotesAction() {
  const session = await requireSession();
  return getPersonalNotes(session.appToken!);
}

export async function getPersonalNoteAction(id: string) {
  const session = await requireSession();
  return getPersonalNote(session.appToken!, id);
}

export async function createPersonalNoteAction(input: PersonalNoteInput): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await createPersonalNote(session.appToken!, input);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create note" };
  }
  revalidatePath("/dashboard");
  return {};
}

export async function updatePersonalNoteAction(id: string, input: PersonalNoteInput): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await updatePersonalNote(session.appToken!, id, input);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save note" };
  }
  revalidatePath("/dashboard");
  return {};
}

export async function deletePersonalNoteAction(id: string): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await deletePersonalNote(session.appToken!, id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete note" };
  }
  revalidatePath("/dashboard");
  return {};
}

export async function getTeamNotesListAction() {
  const session = await requireSession();
  return getTeamNotesList(session.appToken!);
}

export async function getCreatableTeamsAction() {
  const session = await requireSession();
  return getCreatableTeams(session.appToken!);
}

export async function createTeamNoteAction(input: {
  teamId: string;
  title: string;
  meetingAt?: string | null;
  memberIds: string[];
}): Promise<{ id?: string; error?: string }> {
  const session = await requireSession();
  try {
    const note = await createTeamNote(session.appToken!, input);
    revalidatePath("/dashboard/notes");
    return { id: note.id };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create team note" };
  }
}

export async function getTeamNoteAction(id: string) {
  const session = await requireSession();
  return getTeamNote(session.appToken!, id);
}

export async function updateTeamNoteAction(
  id: string,
  input: { title?: string; meetingAt?: string | null; content?: string },
): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await updateTeamNote(session.appToken!, id, input);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to save" };
  }
  revalidatePath("/dashboard/notes");
  return {};
}

export async function addTeamNoteMemberAction(id: string, userId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await addTeamNoteMember(session.appToken!, id, userId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add member" };
  }
  revalidatePath("/dashboard/notes");
  return {};
}

export async function removeTeamNoteMemberAction(id: string, userId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await removeTeamNoteMember(session.appToken!, id, userId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to remove member" };
  }
  revalidatePath("/dashboard/notes");
  return {};
}

export async function searchCandidateUsersAction(id: string, q: string) {
  const session = await requireSession();
  return searchCandidateUsers(session.appToken!, id, q);
}

export async function searchCandidateUsersForTeamAction(teamId: string, q: string) {
  const session = await requireSession();
  return searchCandidateUsersForTeam(session.appToken!, teamId, q);
}

export async function getNotificationsAction() {
  const session = await requireSession();
  return getNotifications(session.appToken!);
}

export async function getUnreadNotificationsCountAction(): Promise<{ count: number }> {
  const session = await requireSession();
  return getUnreadNotificationsCount(session.appToken!);
}

export async function markNotificationReadAction(id: string): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await markNotificationRead(session.appToken!, id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to mark as read" };
  }
  return {};
}

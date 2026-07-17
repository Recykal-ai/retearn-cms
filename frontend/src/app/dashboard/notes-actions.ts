"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import {
  getPersonalNotes,
  getPersonalNote,
  createPersonalNote,
  updatePersonalNote,
  deletePersonalNote,
  getPersonalNoteFolders,
  createPersonalNoteFolder,
  updatePersonalNoteFolder,
  deletePersonalNoteFolder,
  getTeamNotesList,
  getCreatableTeams,
  createTeamNote,
  getTeamNote,
  updateTeamNote,
  addTeamNoteMember,
  removeTeamNoteMember,
  searchCandidateUsers,
  searchCandidateUsersForTeam,
  getTeamNoteFolders,
  createTeamNoteFolder,
  updateTeamNoteFolder,
  deleteTeamNoteFolder,
  getNotifications,
  getUnreadNotificationsCount,
  markNotificationRead,
  uploadNoteImage,
  getNoteImageViewUrl,
  getTeamNoteActivity,
  getTeamNoteComments,
  addTeamNoteComment,
  editTeamNoteComment,
  resolveTeamNoteComment,
  deleteTeamNoteComment,
  type PersonalNoteInput,
  type TeamNoteCommentEntry,
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

export async function getPersonalNoteFoldersAction() {
  const session = await requireSession();
  return getPersonalNoteFolders(session.appToken!);
}

export async function createPersonalNoteFolderAction(input: {
  name: string;
  parentId?: string | null;
}): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await createPersonalNoteFolder(session.appToken!, input);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create folder" };
  }
  revalidatePath("/dashboard/notes");
  return {};
}

export async function updatePersonalNoteFolderAction(
  id: string,
  input: { name?: string; parentId?: string | null },
): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await updatePersonalNoteFolder(session.appToken!, id, input);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update folder" };
  }
  revalidatePath("/dashboard/notes");
  return {};
}

export async function deletePersonalNoteFolderAction(id: string): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await deletePersonalNoteFolder(session.appToken!, id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete folder" };
  }
  revalidatePath("/dashboard/notes");
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

export async function getTeamNoteFoldersAction() {
  const session = await requireSession();
  return getTeamNoteFolders(session.appToken!);
}

export async function createTeamNoteFolderAction(input: {
  teamId: string;
  name: string;
  parentId?: string | null;
}): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await createTeamNoteFolder(session.appToken!, input);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to create folder" };
  }
  revalidatePath("/dashboard/notes");
  return {};
}

export async function updateTeamNoteFolderAction(
  id: string,
  input: { name?: string; parentId?: string | null },
): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await updateTeamNoteFolder(session.appToken!, id, input);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update folder" };
  }
  revalidatePath("/dashboard/notes");
  return {};
}

export async function deleteTeamNoteFolderAction(id: string): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await deleteTeamNoteFolder(session.appToken!, id);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete folder" };
  }
  revalidatePath("/dashboard/notes");
  return {};
}

export async function createTeamNoteAction(input: {
  teamId: string;
  title: string;
  folderId?: string | null;
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
  input: { title?: string; folderId?: string | null; meetingAt?: string | null; content?: string },
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

export async function uploadNoteImageAction(formData: FormData): Promise<{ key?: string; error?: string }> {
  const session = await requireSession();
  try {
    const result = await uploadNoteImage(session.appToken!, formData);
    return { key: result.key };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to upload image" };
  }
}

export async function getNoteImageViewUrlAction(key: string) {
  const session = await requireSession();
  return getNoteImageViewUrl(session.appToken!, key);
}

export async function getTeamNoteActivityAction(id: string) {
  const session = await requireSession();
  return getTeamNoteActivity(session.appToken!, id);
}

export async function getTeamNoteCommentsAction(id: string) {
  const session = await requireSession();
  return getTeamNoteComments(session.appToken!, id);
}

export async function addTeamNoteCommentAction(
  id: string,
  input: { quotedText: string; body: string; parentId?: string; mentionedUserIds?: string[] },
): Promise<{ comment?: TeamNoteCommentEntry; error?: string }> {
  const session = await requireSession();
  try {
    const comment = await addTeamNoteComment(session.appToken!, id, input);
    revalidatePath("/dashboard/notes");
    return { comment };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to add comment" };
  }
}

export async function editTeamNoteCommentAction(
  id: string,
  commentId: string,
  body: string,
): Promise<{ comment?: TeamNoteCommentEntry; error?: string }> {
  const session = await requireSession();
  try {
    const comment = await editTeamNoteComment(session.appToken!, id, commentId, body);
    revalidatePath("/dashboard/notes");
    return { comment };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to edit comment" };
  }
}

export async function resolveTeamNoteCommentAction(
  id: string,
  commentId: string,
  resolved: boolean,
): Promise<{ comment?: TeamNoteCommentEntry; error?: string }> {
  const session = await requireSession();
  try {
    const comment = await resolveTeamNoteComment(session.appToken!, id, commentId, resolved);
    revalidatePath("/dashboard/notes");
    return { comment };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to update comment" };
  }
}

export async function deleteTeamNoteCommentAction(id: string, commentId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  try {
    await deleteTeamNoteComment(session.appToken!, id, commentId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Failed to delete comment" };
  }
  revalidatePath("/dashboard/notes");
  return {};
}

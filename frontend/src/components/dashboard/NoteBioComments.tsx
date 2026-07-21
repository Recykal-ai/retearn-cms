"use client";

import type { TeamNoteCommentEntry } from "@/lib/api";
import { Message, Avatar } from "@/components/dashboard/FloatingComments";
import { MentionInput, type MentionCandidate } from "@/components/dashboard/MentionInput";
import { addTeamNoteCommentAction, deleteTeamNoteCommentAction } from "@/app/dashboard/notes-actions";
import { useToast } from "@/components/ToastProvider";

// Notion's own "Add a comment" row right under the title — a discussion
// about the note as a whole, not about any particular line of text (that's
// FloatingComments' job, anchored to a selection in the body). Reuses the
// exact same TeamNoteComment model and Message/MentionInput UI; the only
// thing distinguishing a bio comment from a text-anchored one is an empty
// quotedText — a real text-selection comment always carries the quoted
// text it was raised against, so "" is never ambiguous with a real one.
export function NoteBioComments({
  teamNoteId,
  comments,
  members,
  currentUserId,
  currentUserName,
  forceOpen,
  onChanged,
}: {
  teamNoteId: string;
  comments: TeamNoteCommentEntry[];
  members: MentionCandidate[];
  currentUserId: string;
  currentUserName: string;
  // True right after the header's "Add comment" placeholder was clicked —
  // keeps the composer open even though there's nothing to show yet.
  forceOpen: boolean;
  onChanged: () => void;
}) {
  const { show } = useToast();
  const roots = comments
    .filter((c) => c.parentId === null && c.quotedText === "")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  if (roots.length === 0 && !forceOpen) return null;

  async function handleSubmit(body: string, mentionedUserIds: string[]) {
    const result = await addTeamNoteCommentAction(teamNoteId, { quotedText: "", body, mentionedUserIds });
    if (result.error) {
      show(result.error, "error");
      return;
    }
    onChanged();
  }

  async function handleDelete(commentId: string) {
    const result = await deleteTeamNoteCommentAction(teamNoteId, commentId);
    if (result.error) {
      show(result.error, "error");
      return;
    }
    onChanged();
  }

  return (
    <div className="my-4 space-y-3 border-t border-b border-neutral-100 py-3">
      {roots.map((root) => (
        <BioThread key={root.id} root={root} replies={comments.filter((c) => c.parentId === root.id)} teamNoteId={teamNoteId} currentUserId={currentUserId} onDelete={handleDelete} onChanged={onChanged} />
      ))}
      <div className="flex items-start gap-1.5">
        <Avatar name={currentUserName} />
        <div className="min-w-0 flex-1">
          <MentionInput members={members} onSubmit={handleSubmit} placeholder="Add a comment…" />
        </div>
      </div>
    </div>
  );
}

function BioThread({
  root,
  replies,
  teamNoteId,
  currentUserId,
  onDelete,
  onChanged,
}: {
  root: TeamNoteCommentEntry;
  replies: TeamNoteCommentEntry[];
  teamNoteId: string;
  currentUserId: string;
  onDelete: (commentId: string) => void;
  onChanged: () => void;
}) {
  return (
    <div>
      <Message comment={root} teamNoteId={teamNoteId} currentUserId={currentUserId} onDelete={() => onDelete(root.id)} onChanged={onChanged} />
      {replies.map((r) => (
        <div key={r.id} className="mt-1.5 ml-7 border-l border-neutral-100 pl-2.5">
          <Message comment={r} teamNoteId={teamNoteId} currentUserId={currentUserId} onDelete={() => onDelete(r.id)} onChanged={onChanged} />
        </div>
      ))}
    </div>
  );
}

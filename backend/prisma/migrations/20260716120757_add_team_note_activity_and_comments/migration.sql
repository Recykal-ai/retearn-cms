-- CreateEnum
CREATE TYPE "TeamNoteActivityAction" AS ENUM ('EDITED_DETAILS', 'ADDED_IMAGE', 'LINKED_DOCUMENT', 'ADDED_COMMENT', 'RESOLVED_COMMENT', 'REOPENED_COMMENT', 'EDITED_CONTENT');

-- CreateTable
CREATE TABLE "TeamNoteActivity" (
    "id" TEXT NOT NULL,
    "teamNoteId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" "TeamNoteActivityAction" NOT NULL,
    "anchorId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamNoteActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamNoteComment" (
    "id" TEXT NOT NULL,
    "teamNoteId" TEXT NOT NULL,
    "parentId" TEXT,
    "quotedText" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamNoteComment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeamNoteActivity_teamNoteId_createdAt_idx" ON "TeamNoteActivity"("teamNoteId", "createdAt");

-- CreateIndex
CREATE INDEX "TeamNoteComment_teamNoteId_idx" ON "TeamNoteComment"("teamNoteId");

-- AddForeignKey
ALTER TABLE "TeamNoteActivity" ADD CONSTRAINT "TeamNoteActivity_teamNoteId_fkey" FOREIGN KEY ("teamNoteId") REFERENCES "TeamNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNoteActivity" ADD CONSTRAINT "TeamNoteActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNoteComment" ADD CONSTRAINT "TeamNoteComment_teamNoteId_fkey" FOREIGN KEY ("teamNoteId") REFERENCES "TeamNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNoteComment" ADD CONSTRAINT "TeamNoteComment_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TeamNoteComment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNoteComment" ADD CONSTRAINT "TeamNoteComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNoteComment" ADD CONSTRAINT "TeamNoteComment_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

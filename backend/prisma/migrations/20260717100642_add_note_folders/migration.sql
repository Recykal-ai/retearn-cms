-- AlterTable
ALTER TABLE "PersonalNote" ADD COLUMN     "folderId" TEXT;

-- AlterTable
ALTER TABLE "TeamNote" ADD COLUMN     "folderId" TEXT;

-- CreateTable
CREATE TABLE "PersonalNoteFolder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalNoteFolder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamNoteFolder" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamNoteFolder_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PersonalNote" ADD CONSTRAINT "PersonalNote_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "PersonalNoteFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalNoteFolder" ADD CONSTRAINT "PersonalNoteFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalNoteFolder" ADD CONSTRAINT "PersonalNoteFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "PersonalNoteFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNote" ADD CONSTRAINT "TeamNote_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "TeamNoteFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNoteFolder" ADD CONSTRAINT "TeamNoteFolder_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNoteFolder" ADD CONSTRAINT "TeamNoteFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "TeamNoteFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNoteFolder" ADD CONSTRAINT "TeamNoteFolder_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

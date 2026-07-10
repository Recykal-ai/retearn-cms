/*
  Warnings:

  - You are about to drop the column `teamId` on the `Notification` table. All the data in the column will be lost.
  - The primary key for the `TeamNote` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The primary key for the `TeamNoteMembership` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `teamId` on the `TeamNoteMembership` table. All the data in the column will be lost.
  - Added the required column `teamNoteId` to the `Notification` table without a default value. This is not possible if the table is not empty.
  - Added the required column `createdById` to the `TeamNote` table without a default value. This is not possible if the table is not empty.
  - The required column `id` was added to the `TeamNote` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Added the required column `title` to the `TeamNote` table without a default value. This is not possible if the table is not empty.
  - Added the required column `teamNoteId` to the `TeamNoteMembership` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Notification" DROP CONSTRAINT "Notification_teamId_fkey";

-- DropForeignKey
ALTER TABLE "TeamNoteMembership" DROP CONSTRAINT "TeamNoteMembership_teamId_fkey";

-- AlterTable
ALTER TABLE "Notification" DROP COLUMN "teamId",
ADD COLUMN     "teamNoteId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "TeamNote" DROP CONSTRAINT "TeamNote_pkey",
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "createdById" TEXT NOT NULL,
ADD COLUMN     "id" TEXT NOT NULL,
ADD COLUMN     "meetingAt" TIMESTAMP(3),
ADD COLUMN     "title" TEXT NOT NULL,
ADD CONSTRAINT "TeamNote_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "TeamNoteMembership" DROP CONSTRAINT "TeamNoteMembership_pkey",
DROP COLUMN "teamId",
ADD COLUMN     "teamNoteId" TEXT NOT NULL,
ADD CONSTRAINT "TeamNoteMembership_pkey" PRIMARY KEY ("userId", "teamNoteId");

-- AddForeignKey
ALTER TABLE "TeamNote" ADD CONSTRAINT "TeamNote_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamNoteMembership" ADD CONSTRAINT "TeamNoteMembership_teamNoteId_fkey" FOREIGN KEY ("teamNoteId") REFERENCES "TeamNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_teamNoteId_fkey" FOREIGN KEY ("teamNoteId") REFERENCES "TeamNote"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

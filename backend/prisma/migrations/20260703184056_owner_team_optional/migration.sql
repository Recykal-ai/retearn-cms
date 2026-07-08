-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_ownerTeamId_fkey";

-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "ownerTeamId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "Document" ADD CONSTRAINT "Document_ownerTeamId_fkey" FOREIGN KEY ("ownerTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

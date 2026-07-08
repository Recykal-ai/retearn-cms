-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "deletionRequestNote" TEXT,
ADD COLUMN     "deletionRequestedAt" TIMESTAMP(3),
ADD COLUMN     "deletionRequestedById" TEXT;

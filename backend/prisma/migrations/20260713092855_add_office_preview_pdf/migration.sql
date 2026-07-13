-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "previewS3Key" TEXT;

-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "previewS3Key" TEXT;

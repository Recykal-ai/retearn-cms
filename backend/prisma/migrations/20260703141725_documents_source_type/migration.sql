-- CreateEnum
CREATE TYPE "DocSourceType" AS ENUM ('FILE', 'LINK');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "externalUrl" TEXT,
ADD COLUMN     "rejectionNote" TEXT,
ADD COLUMN     "sourceType" "DocSourceType" NOT NULL DEFAULT 'FILE',
ALTER COLUMN "s3Key" DROP NOT NULL;

-- AlterTable
ALTER TABLE "DocumentVersion" ADD COLUMN     "externalUrl" TEXT,
ADD COLUMN     "sourceType" "DocSourceType" NOT NULL DEFAULT 'FILE',
ALTER COLUMN "s3Key" DROP NOT NULL;

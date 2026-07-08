-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "PinnedDocument" (
    "userId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PinnedDocument_pkey" PRIMARY KEY ("userId","documentId")
);

-- AddForeignKey
ALTER TABLE "PinnedDocument" ADD CONSTRAINT "PinnedDocument_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PinnedDocument" ADD CONSTRAINT "PinnedDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

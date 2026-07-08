-- CreateTable
CREATE TABLE "DocumentCategory" (
    "documentId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,

    CONSTRAINT "DocumentCategory_pkey" PRIMARY KEY ("documentId","categoryId")
);

-- AddForeignKey
ALTER TABLE "DocumentCategory" ADD CONSTRAINT "DocumentCategory_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentCategory" ADD CONSTRAINT "DocumentCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Backfill: carry each document's existing single category into the new join table
INSERT INTO "DocumentCategory" ("documentId", "categoryId")
SELECT "id", "categoryId" FROM "Document" WHERE "categoryId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "Document" DROP CONSTRAINT "Document_categoryId_fkey";

-- AlterTable
ALTER TABLE "Document" DROP COLUMN "categoryId";

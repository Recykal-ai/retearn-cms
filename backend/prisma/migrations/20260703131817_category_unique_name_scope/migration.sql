-- AlterTable
ALTER TABLE "Category" ADD CONSTRAINT "Category_name_scope_key" UNIQUE ("name", "scope");

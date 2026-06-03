/*
  Warnings:

  - A unique constraint covering the columns `[source_text,target_language,source_language,type,user_id]` on the table `custom_translations` will be added. If there are existing duplicate values, this will fail.
  - Made the column `created_by` on table `custom_translations` required. This step will fail if there are existing NULL values in that column.

*/
-- DropIndex
DROP INDEX "custom_translations_source_target_idx";

-- AlterTable
ALTER TABLE "custom_translations" ADD COLUMN     "type" VARCHAR(20) NOT NULL DEFAULT 'personal',
ADD COLUMN     "user_id" BIGINT,
ALTER COLUMN "created_by" SET NOT NULL;

-- CreateIndex
CREATE INDEX "custom_translations_user_id_idx" ON "custom_translations"("user_id");

-- CreateIndex
CREATE INDEX "custom_translations_type_idx" ON "custom_translations"("type");

-- CreateIndex
CREATE UNIQUE INDEX "custom_translations_unique_idx" ON "custom_translations"("source_text", "target_language", "source_language", "type", "user_id");

-- AddForeignKey
ALTER TABLE "custom_translations" ADD CONSTRAINT "custom_translations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

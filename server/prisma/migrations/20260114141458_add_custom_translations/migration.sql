-- CreateTable
CREATE TABLE "custom_translations" (
    "id" BIGSERIAL NOT NULL,
    "source_text" VARCHAR(500) NOT NULL,
    "target_language" VARCHAR(10) NOT NULL,
    "translated_text" VARCHAR(1000) NOT NULL,
    "source_language" VARCHAR(10) NOT NULL DEFAULT 'en',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" BIGINT,

    CONSTRAINT "custom_translations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "custom_translations_source_target_idx" ON "custom_translations"("source_text", "target_language", "source_language");

-- CreateIndex
CREATE INDEX "custom_translations_target_language_idx" ON "custom_translations"("target_language");

-- AddForeignKey
ALTER TABLE "custom_translations" ADD CONSTRAINT "custom_translations_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

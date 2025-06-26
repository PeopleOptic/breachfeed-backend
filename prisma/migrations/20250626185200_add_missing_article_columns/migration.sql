-- Add missing columns to Article table
ALTER TABLE "Article" ADD COLUMN "content" TEXT;
ALTER TABLE "Article" ADD COLUMN "categories" TEXT[];
ALTER TABLE "Article" ADD COLUMN "location" TEXT;
ALTER TABLE "Article" ADD COLUMN "agencies" TEXT[];
ALTER TABLE "Article" ADD COLUMN "summary" TEXT;
ALTER TABLE "Article" ADD COLUMN "recommendations" TEXT;
ALTER TABLE "Article" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Add missing indexes
CREATE INDEX "Article_processed_idx" ON "Article"("processed");
CREATE INDEX "Article_severity_idx" ON "Article"("severity");
CREATE INDEX "Article_location_idx" ON "Article"("location");
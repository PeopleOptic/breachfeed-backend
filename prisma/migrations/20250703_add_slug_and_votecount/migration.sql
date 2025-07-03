-- Add slug column to Article table
ALTER TABLE "Article" ADD COLUMN "slug" TEXT;

-- Add voteCount column to Article table
ALTER TABLE "Article" ADD COLUMN "voteCount" INTEGER NOT NULL DEFAULT 0;

-- Create unique index on slug
CREATE UNIQUE INDEX "Article_slug_key" ON "Article"("slug");

-- Create index on voteCount for performance
CREATE INDEX "Article_voteCount_idx" ON "Article"("voteCount");

-- Create index on slug for performance
CREATE INDEX "Article_slug_idx" ON "Article"("slug");
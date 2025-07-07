-- Add slug fields to entities for URL-friendly routing

-- Add slug to Keyword
ALTER TABLE "Keyword" ADD COLUMN "slug" TEXT;

-- Add slug to Agency
ALTER TABLE "Agency" ADD COLUMN "slug" TEXT;

-- Add slug to Location
ALTER TABLE "Location" ADD COLUMN "slug" TEXT;

-- Create unique indexes for slugs
CREATE UNIQUE INDEX "Keyword_slug_key" ON "Keyword"("slug");
CREATE UNIQUE INDEX "Agency_slug_key" ON "Agency"("slug");
CREATE UNIQUE INDEX "Location_slug_key" ON "Location"("slug");

-- Update existing records with generated slugs
UPDATE "Keyword" SET "slug" = LOWER(REPLACE(REPLACE(REPLACE("term", ' ', '-'), '/', '-'), '''', ''));
UPDATE "Agency" SET "slug" = LOWER(REPLACE(REPLACE(REPLACE("name", ' ', '-'), '/', '-'), '''', ''));
UPDATE "Location" SET "slug" = LOWER(REPLACE(REPLACE(REPLACE("name", ' ', '-'), '/', '-'), '''', ''));
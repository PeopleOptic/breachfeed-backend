-- Add slug fields to entities for URL-friendly routing

-- Add slug to Keyword
ALTER TABLE "Keyword" ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- Add slug to Agency  
ALTER TABLE "Agency" ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- Add slug to Location
ALTER TABLE "Location" ADD COLUMN IF NOT EXISTS "slug" TEXT;

-- Create unique indexes for slugs (if they don't exist)
CREATE UNIQUE INDEX IF NOT EXISTS "Keyword_slug_key" ON "Keyword"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Agency_slug_key" ON "Agency"("slug");
CREATE UNIQUE INDEX IF NOT EXISTS "Location_slug_key" ON "Location"("slug");

-- Update existing records with generated slugs
UPDATE "Keyword" 
SET "slug" = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE("term", '[^a-zA-Z0-9]+', '-', 'g'),
      '^-+', '', 'g'
    ),
    '-+$', '', 'g'
  )
)
WHERE "slug" IS NULL;

UPDATE "Agency" 
SET "slug" = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g'),
      '^-+', '', 'g'
    ),
    '-+$', '', 'g'
  )
)
WHERE "slug" IS NULL;

UPDATE "Location" 
SET "slug" = LOWER(
  REGEXP_REPLACE(
    REGEXP_REPLACE(
      REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g'),
      '^-+', '', 'g'
    ),
    '-+$', '', 'g'
  )
)
WHERE "slug" IS NULL;
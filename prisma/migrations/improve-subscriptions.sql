-- Migration to improve subscription schema
-- This separates the targetId into specific ID fields for each entity type

-- Step 1: Add new columns
ALTER TABLE "Subscription" 
ADD COLUMN "companyId" TEXT,
ADD COLUMN "agencyId" TEXT,
ADD COLUMN "locationId" TEXT,
ADD COLUMN "keywordId" TEXT;

-- Step 2: Migrate existing data
UPDATE "Subscription" 
SET "companyId" = "targetId" 
WHERE "type" = 'COMPANY' AND "targetId" IS NOT NULL;

UPDATE "Subscription" 
SET "agencyId" = "targetId" 
WHERE "type" = 'AGENCY' AND "targetId" IS NOT NULL;

UPDATE "Subscription" 
SET "locationId" = "targetId" 
WHERE "type" = 'LOCATION' AND "targetId" IS NOT NULL;

UPDATE "Subscription" 
SET "keywordId" = "targetId" 
WHERE "type" = 'KEYWORD' AND "targetId" IS NOT NULL;

-- Step 3: Add foreign key constraints
ALTER TABLE "Subscription"
ADD CONSTRAINT "Subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "Subscription_agencyId_fkey" FOREIGN KEY ("agencyId") REFERENCES "Agency"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "Subscription_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "Subscription_keywordId_fkey" FOREIGN KEY ("keywordId") REFERENCES "Keyword"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 4: Add indexes
CREATE INDEX "Subscription_companyId_idx" ON "Subscription"("companyId");
CREATE INDEX "Subscription_agencyId_idx" ON "Subscription"("agencyId");
CREATE INDEX "Subscription_locationId_idx" ON "Subscription"("locationId");
CREATE INDEX "Subscription_keywordId_idx" ON "Subscription"("keywordId");

-- Step 5: Drop old foreign key constraints (after verifying data migration)
ALTER TABLE "Subscription"
DROP CONSTRAINT IF EXISTS "Subscription_agency_fkey",
DROP CONSTRAINT IF EXISTS "Subscription_company_fkey",
DROP CONSTRAINT IF EXISTS "Subscription_keyword_fkey",
DROP CONSTRAINT IF EXISTS "Subscription_location_fkey";

-- Step 6: Update unique constraints
ALTER TABLE "Subscription" DROP CONSTRAINT IF EXISTS "Subscription_userId_type_targetId_key";

ALTER TABLE "Subscription" 
ADD CONSTRAINT "Subscription_userId_type_companyId_key" UNIQUE("userId", "type", "companyId"),
ADD CONSTRAINT "Subscription_userId_type_agencyId_key" UNIQUE("userId", "type", "agencyId"),
ADD CONSTRAINT "Subscription_userId_type_locationId_key" UNIQUE("userId", "type", "locationId"),
ADD CONSTRAINT "Subscription_userId_type_keywordId_key" UNIQUE("userId", "type", "keywordId");

-- Note: We keep targetId for now for backward compatibility
-- It can be dropped in a future migration after updating all code
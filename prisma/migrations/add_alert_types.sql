-- Add new alert type values to IncidentType enum
ALTER TYPE "IncidentType" ADD VALUE IF NOT EXISTS 'CONFIRMED_BREACH';
ALTER TYPE "IncidentType" ADD VALUE IF NOT EXISTS 'SECURITY_INCIDENT';
ALTER TYPE "IncidentType" ADD VALUE IF NOT EXISTS 'SECURITY_MENTION';

-- Add alert type and classification confidence to Article table
ALTER TABLE "Article" 
ADD COLUMN IF NOT EXISTS "alertType" TEXT DEFAULT 'SECURITY_MENTION',
ADD COLUMN IF NOT EXISTS "classificationConfidence" DOUBLE PRECISION DEFAULT 0.5;

-- Add index for alert type for better query performance
CREATE INDEX IF NOT EXISTS "Article_alertType_idx" ON "Article"("alertType");

-- Update existing articles to have appropriate alert types based on severity
UPDATE "Article" 
SET "alertType" = CASE 
    WHEN "severity" = 'CRITICAL' THEN 'CONFIRMED_BREACH'
    WHEN "severity" = 'HIGH' THEN 'SECURITY_INCIDENT'
    ELSE 'SECURITY_MENTION'
END
WHERE "alertType" IS NULL OR "alertType" = 'SECURITY_MENTION';

-- Add alert type preference to Subscription table
ALTER TABLE "Subscription"
ADD COLUMN IF NOT EXISTS "alertTypeFilter" TEXT[] DEFAULT ARRAY['CONFIRMED_BREACH', 'SECURITY_INCIDENT', 'SECURITY_MENTION'];

-- Add comment explaining the alert types
COMMENT ON COLUMN "Article"."alertType" IS 'Classification of the security alert: CONFIRMED_BREACH (definitive breach), SECURITY_INCIDENT (active investigation), SECURITY_MENTION (general mention)';
COMMENT ON COLUMN "Article"."classificationConfidence" IS 'Confidence score (0-1) of the alert type classification';
COMMENT ON COLUMN "Subscription"."alertTypeFilter" IS 'Array of alert types this subscription should trigger on';
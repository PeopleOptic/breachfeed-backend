-- Comprehensive fix for all missing columns in the database
-- This script adds ALL missing columns based on the Prisma schema

-- Fix Article table
DO $$ 
BEGIN
    -- Add content column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Article' AND column_name='content') THEN
        ALTER TABLE "Article" ADD COLUMN "content" TEXT;
    END IF;
    
    -- Add categories column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Article' AND column_name='categories') THEN
        ALTER TABLE "Article" ADD COLUMN "categories" TEXT[] DEFAULT '{}';
    END IF;
    
    -- Add location column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Article' AND column_name='location') THEN
        ALTER TABLE "Article" ADD COLUMN "location" TEXT;
    END IF;
    
    -- Add agencies column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Article' AND column_name='agencies') THEN
        ALTER TABLE "Article" ADD COLUMN "agencies" TEXT[] DEFAULT '{}';
    END IF;
    
    -- Add summary column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Article' AND column_name='summary') THEN
        ALTER TABLE "Article" ADD COLUMN "summary" TEXT;
    END IF;
    
    -- Add recommendations column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Article' AND column_name='recommendations') THEN
        ALTER TABLE "Article" ADD COLUMN "recommendations" TEXT;
    END IF;
    
    -- Add updatedAt column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Article' AND column_name='updatedAt') THEN
        ALTER TABLE "Article" ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
        UPDATE "Article" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
        ALTER TABLE "Article" ALTER COLUMN "updatedAt" SET NOT NULL;
    END IF;
    
    -- Add imageUrl column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Article' AND column_name='imageUrl') THEN
        ALTER TABLE "Article" ADD COLUMN "imageUrl" TEXT;
    END IF;
    
    -- Add severity column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Article' AND column_name='severity') THEN
        ALTER TABLE "Article" ADD COLUMN "severity" TEXT DEFAULT 'MEDIUM';
    END IF;
END $$;

-- Fix Agency table
DO $$
BEGIN
    -- Add acronym column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Agency' AND column_name='acronym') THEN
        ALTER TABLE "Agency" ADD COLUMN "acronym" TEXT;
    END IF;
    
    -- Add type column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Agency' AND column_name='type') THEN
        ALTER TABLE "Agency" ADD COLUMN "type" TEXT DEFAULT 'GOVERNMENT';
    END IF;
END $$;

-- Fix Company table
DO $$
BEGIN
    -- Add aliases column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Company' AND column_name='aliases') THEN
        ALTER TABLE "Company" ADD COLUMN "aliases" TEXT[] DEFAULT '{}';
    END IF;
    
    -- Add domain column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Company' AND column_name='domain') THEN
        ALTER TABLE "Company" ADD COLUMN "domain" TEXT;
    END IF;
END $$;

-- Fix Location table
DO $$
BEGIN
    -- Add region column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Location' AND column_name='region') THEN
        ALTER TABLE "Location" ADD COLUMN "region" TEXT;
    END IF;
    
    -- Add city column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Location' AND column_name='city') THEN
        ALTER TABLE "Location" ADD COLUMN "city" TEXT;
    END IF;
    
    -- Add coordinates column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Location' AND column_name='coordinates') THEN
        ALTER TABLE "Location" ADD COLUMN "coordinates" TEXT;
    END IF;
END $$;

-- Fix Subscription table
DO $$
BEGIN
    -- Add severityFilter column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Subscription' AND column_name='severityFilter') THEN
        ALTER TABLE "Subscription" ADD COLUMN "severityFilter" TEXT;
    END IF;
    
    -- Add locationFilter column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Subscription' AND column_name='locationFilter') THEN
        ALTER TABLE "Subscription" ADD COLUMN "locationFilter" TEXT;
    END IF;
    
    -- Add keywordFilters column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Subscription' AND column_name='keywordFilters') THEN
        ALTER TABLE "Subscription" ADD COLUMN "keywordFilters" TEXT[] DEFAULT '{}';
    END IF;
END $$;

-- Fix Incident table
DO $$
BEGIN
    -- Add affectedEntities column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Incident' AND column_name='affectedEntities') THEN
        ALTER TABLE "Incident" ADD COLUMN "affectedEntities" TEXT[] DEFAULT '{}';
    END IF;
    
    -- Add timeline column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Incident' AND column_name='timeline') THEN
        ALTER TABLE "Incident" ADD COLUMN "timeline" JSONB;
    END IF;
    
    -- Add impact column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Incident' AND column_name='impact') THEN
        ALTER TABLE "Incident" ADD COLUMN "impact" TEXT;
    END IF;
    
    -- Add incidentType column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Incident' AND column_name='incidentType') THEN
        ALTER TABLE "Incident" ADD COLUMN "incidentType" TEXT DEFAULT 'OTHER';
    END IF;
    
    -- Add status column if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Incident' AND column_name='status') THEN
        ALTER TABLE "Incident" ADD COLUMN "status" TEXT DEFAULT 'ACTIVE';
    END IF;
END $$;

-- Add missing indexes
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='Article' AND indexname='Article_severity_idx') THEN
        CREATE INDEX "Article_severity_idx" ON "Article"("severity");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='Article' AND indexname='Article_location_idx') THEN
        CREATE INDEX "Article_location_idx" ON "Article"("location");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='Incident' AND indexname='Incident_severity_idx') THEN
        CREATE INDEX "Incident_severity_idx" ON "Incident"("severity");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='Incident' AND indexname='Incident_incidentType_idx') THEN
        CREATE INDEX "Incident_incidentType_idx" ON "Incident"("incidentType");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='Incident' AND indexname='Incident_status_idx') THEN
        CREATE INDEX "Incident_status_idx" ON "Incident"("status");
    END IF;
END $$;

-- Final verification - show all tables and their columns
SELECT 
    t.table_name,
    array_agg(c.column_name::text ORDER BY c.ordinal_position) as columns
FROM information_schema.tables t
JOIN information_schema.columns c ON t.table_name = c.table_name
WHERE t.table_schema = 'public' 
  AND t.table_type = 'BASE TABLE'
  AND t.table_name NOT LIKE '\_%'
GROUP BY t.table_name
ORDER BY t.table_name;
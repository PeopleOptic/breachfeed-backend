-- Manual database fix for missing Article columns
-- Run this directly on the Railway PostgreSQL database

-- Add missing columns to Article table (with safety checks)
DO $$ 
BEGIN
    -- Add content column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Article' AND column_name='content') THEN
        ALTER TABLE "Article" ADD COLUMN "content" TEXT;
        RAISE NOTICE 'Added content column';
    ELSE
        RAISE NOTICE 'content column already exists';
    END IF;
    
    -- Add categories column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Article' AND column_name='categories') THEN
        ALTER TABLE "Article" ADD COLUMN "categories" TEXT[] DEFAULT '{}';
        RAISE NOTICE 'Added categories column';
    ELSE
        RAISE NOTICE 'categories column already exists';
    END IF;
    
    -- Add location column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Article' AND column_name='location') THEN
        ALTER TABLE "Article" ADD COLUMN "location" TEXT;
        RAISE NOTICE 'Added location column';
    ELSE
        RAISE NOTICE 'location column already exists';
    END IF;
    
    -- Add agencies column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Article' AND column_name='agencies') THEN
        ALTER TABLE "Article" ADD COLUMN "agencies" TEXT[] DEFAULT '{}';
        RAISE NOTICE 'Added agencies column';
    ELSE
        RAISE NOTICE 'agencies column already exists';
    END IF;
    
    -- Add summary column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Article' AND column_name='summary') THEN
        ALTER TABLE "Article" ADD COLUMN "summary" TEXT;
        RAISE NOTICE 'Added summary column';
    ELSE
        RAISE NOTICE 'summary column already exists';
    END IF;
    
    -- Add recommendations column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Article' AND column_name='recommendations') THEN
        ALTER TABLE "Article" ADD COLUMN "recommendations" TEXT;
        RAISE NOTICE 'Added recommendations column';
    ELSE
        RAISE NOTICE 'recommendations column already exists';
    END IF;
    
    -- Add updatedAt column if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Article' AND column_name='updatedAt') THEN
        ALTER TABLE "Article" ADD COLUMN "updatedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP;
        -- Update existing rows to have updatedAt = createdAt
        UPDATE "Article" SET "updatedAt" = "createdAt" WHERE "updatedAt" IS NULL;
        -- Now make it NOT NULL
        ALTER TABLE "Article" ALTER COLUMN "updatedAt" SET NOT NULL;
        RAISE NOTICE 'Added updatedAt column';
    ELSE
        RAISE NOTICE 'updatedAt column already exists';
    END IF;
END $$;

-- Add missing indexes (with safety checks)
DO $$
BEGIN
    -- Add processed index if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='Article' AND indexname='Article_processed_idx') THEN
        CREATE INDEX "Article_processed_idx" ON "Article"("processed");
        RAISE NOTICE 'Added processed index';
    ELSE
        RAISE NOTICE 'processed index already exists';
    END IF;
    
    -- Add severity index if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='Article' AND indexname='Article_severity_idx') THEN
        CREATE INDEX "Article_severity_idx" ON "Article"("severity");
        RAISE NOTICE 'Added severity index';
    ELSE
        RAISE NOTICE 'severity index already exists';
    END IF;
    
    -- Add location index if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='Article' AND indexname='Article_location_idx') THEN
        CREATE INDEX "Article_location_idx" ON "Article"("location");
        RAISE NOTICE 'Added location index';
    ELSE
        RAISE NOTICE 'location index already exists';
    END IF;
END $$;

-- Check the final structure
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'Article' 
ORDER BY ordinal_position;
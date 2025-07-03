-- Remove the old foreign key constraints that are causing issues
-- Run this if you continue to have foreign key errors

-- First, check what constraints exist
SELECT 
    tc.constraint_name, 
    tc.constraint_type, 
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.table_name = 'Subscription' 
AND tc.constraint_type = 'FOREIGN KEY';

-- Drop the old constraints on targetId
ALTER TABLE "Subscription"
DROP CONSTRAINT IF EXISTS "Subscription_agency_fkey",
DROP CONSTRAINT IF EXISTS "Subscription_company_fkey",
DROP CONSTRAINT IF EXISTS "Subscription_keyword_fkey",
DROP CONSTRAINT IF EXISTS "Subscription_location_fkey";

-- The new constraints on specific ID fields should remain:
-- Subscription_companyId_fkey
-- Subscription_agencyId_fkey  
-- Subscription_locationId_fkey
-- Subscription_keywordId_fkey
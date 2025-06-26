-- Database Reset Script for Railway PostgreSQL
-- This will drop all tables and recreate the schema from scratch

-- WARNING: This will DELETE ALL DATA!
-- Make sure you have backups if needed

-- Drop all tables in reverse dependency order
DROP TABLE IF EXISTS "MatchedLocation" CASCADE;
DROP TABLE IF EXISTS "MatchedAgency" CASCADE;
DROP TABLE IF EXISTS "MatchedCompany" CASCADE;
DROP TABLE IF EXISTS "MatchedKeyword" CASCADE;
DROP TABLE IF EXISTS "Incident" CASCADE;
DROP TABLE IF EXISTS "Notification" CASCADE;
DROP TABLE IF EXISTS "Subscription" CASCADE;
DROP TABLE IF EXISTS "Article" CASCADE;
DROP TABLE IF EXISTS "RssFeed" CASCADE;
DROP TABLE IF EXISTS "Location" CASCADE;
DROP TABLE IF EXISTS "Agency" CASCADE;
DROP TABLE IF EXISTS "Keyword" CASCADE;
DROP TABLE IF EXISTS "Company" CASCADE;
DROP TABLE IF EXISTS "User" CASCADE;

-- Drop the _prisma_migrations table to clear migration history
DROP TABLE IF EXISTS "_prisma_migrations" CASCADE;

-- Verify all tables are dropped
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_type = 'BASE TABLE';
-- Add confidence column to MatchedCompany table
ALTER TABLE "MatchedCompany" ADD COLUMN "confidence" DOUBLE PRECISION DEFAULT 1.0;
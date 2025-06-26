-- Add company profile fields
ALTER TABLE "Company" ADD COLUMN "description" TEXT;
ALTER TABLE "Company" ADD COLUMN "industry" VARCHAR(255);
ALTER TABLE "Company" ADD COLUMN "website" VARCHAR(500);
ALTER TABLE "Company" ADD COLUMN "headquarters" VARCHAR(255);
ALTER TABLE "Company" ADD COLUMN "foundedYear" INTEGER;
ALTER TABLE "Company" ADD COLUMN "employees" VARCHAR(50);
ALTER TABLE "Company" ADD COLUMN "logo" VARCHAR(500);
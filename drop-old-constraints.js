const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function dropOldConstraints() {
  try {
    console.log('Dropping old foreign key constraints on targetId...');
    
    await prisma.$executeRaw`
      ALTER TABLE "Subscription"
      DROP CONSTRAINT IF EXISTS "Subscription_agency_fkey",
      DROP CONSTRAINT IF EXISTS "Subscription_company_fkey",
      DROP CONSTRAINT IF EXISTS "Subscription_keyword_fkey",
      DROP CONSTRAINT IF EXISTS "Subscription_location_fkey";
    `;
    
    console.log('Old constraints dropped successfully!');
    
    // Verify they're gone
    const remainingConstraints = await prisma.$queryRaw`
      SELECT constraint_name, column_name
      FROM information_schema.key_column_usage
      WHERE table_name = 'Subscription' 
      AND column_name = 'targetId'
      AND constraint_name LIKE '%_fkey';
    `;
    
    console.log('Remaining constraints on targetId:', remainingConstraints);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

dropOldConstraints();
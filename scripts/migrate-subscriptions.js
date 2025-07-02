const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function migrateSubscriptions() {
  console.log('Starting subscription migration...');
  
  try {
    // First, check if new columns already exist
    const testSub = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Subscription' 
      AND column_name IN ('companyId', 'agencyId', 'locationId', 'keywordId')
    `;
    
    if (testSub.length > 0) {
      console.log('New columns already exist. Skipping schema modification.');
    } else {
      console.log('Adding new columns...');
      
      // Add new columns
      await prisma.$executeRaw`
        ALTER TABLE "Subscription" 
        ADD COLUMN IF NOT EXISTS "companyId" TEXT,
        ADD COLUMN IF NOT EXISTS "agencyId" TEXT,
        ADD COLUMN IF NOT EXISTS "locationId" TEXT,
        ADD COLUMN IF NOT EXISTS "keywordId" TEXT
      `;
      
      console.log('New columns added successfully.');
    }
    
    // Migrate data
    console.log('Migrating existing data...');
    
    // Get all subscriptions
    const subscriptions = await prisma.subscription.findMany({
      where: {
        targetId: { not: null }
      }
    });
    
    console.log(`Found ${subscriptions.length} subscriptions to migrate.`);
    
    let migrated = 0;
    for (const sub of subscriptions) {
      const updateData = {};
      
      switch (sub.type) {
        case 'COMPANY':
          if (!sub.companyId) updateData.companyId = sub.targetId;
          break;
        case 'AGENCY':
          if (!sub.agencyId) updateData.agencyId = sub.targetId;
          break;
        case 'LOCATION':
          if (!sub.locationId) updateData.locationId = sub.targetId;
          break;
        case 'KEYWORD':
          if (!sub.keywordId) updateData.keywordId = sub.targetId;
          break;
      }
      
      if (Object.keys(updateData).length > 0) {
        await prisma.subscription.update({
          where: { id: sub.id },
          data: updateData
        });
        migrated++;
      }
    }
    
    console.log(`Migrated ${migrated} subscriptions.`);
    
    // Verify migration
    const verifyResults = await prisma.$queryRaw`
      SELECT 
        COUNT(*) FILTER (WHERE type = 'COMPANY' AND "companyId" IS NULL AND "targetId" IS NOT NULL) as unmigrated_companies,
        COUNT(*) FILTER (WHERE type = 'AGENCY' AND "agencyId" IS NULL AND "targetId" IS NOT NULL) as unmigrated_agencies,
        COUNT(*) FILTER (WHERE type = 'LOCATION' AND "locationId" IS NULL AND "targetId" IS NOT NULL) as unmigrated_locations,
        COUNT(*) FILTER (WHERE type = 'KEYWORD' AND "keywordId" IS NULL AND "targetId" IS NOT NULL) as unmigrated_keywords
      FROM "Subscription"
    `;
    
    console.log('Migration verification:', verifyResults[0]);
    
    console.log('Migration completed successfully!');
    
  } catch (error) {
    console.error('Migration error:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run migration
migrateSubscriptions().catch(console.error);
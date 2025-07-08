const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function runMigration() {
  console.log('Starting entity slug migration...\n');

  try {
    // Add slug columns
    console.log('1. Adding slug columns...');
    
    try {
      await prisma.$executeRaw`ALTER TABLE "Keyword" ADD COLUMN "slug" TEXT`;
      console.log('✅ Added slug column to Keyword table');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('ℹ️  Slug column already exists in Keyword table');
      } else throw e;
    }

    try {
      await prisma.$executeRaw`ALTER TABLE "Agency" ADD COLUMN "slug" TEXT`;
      console.log('✅ Added slug column to Agency table');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('ℹ️  Slug column already exists in Agency table');
      } else throw e;
    }

    try {
      await prisma.$executeRaw`ALTER TABLE "Location" ADD COLUMN "slug" TEXT`;
      console.log('✅ Added slug column to Location table');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('ℹ️  Slug column already exists in Location table');
      } else throw e;
    }

    // Create indexes
    console.log('\n2. Creating unique indexes...');
    
    try {
      await prisma.$executeRaw`CREATE UNIQUE INDEX "Keyword_slug_key" ON "Keyword"("slug")`;
      console.log('✅ Created unique index on Keyword.slug');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('ℹ️  Index already exists on Keyword.slug');
      } else throw e;
    }

    try {
      await prisma.$executeRaw`CREATE UNIQUE INDEX "Agency_slug_key" ON "Agency"("slug")`;
      console.log('✅ Created unique index on Agency.slug');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('ℹ️  Index already exists on Agency.slug');
      } else throw e;
    }

    try {
      await prisma.$executeRaw`CREATE UNIQUE INDEX "Location_slug_key" ON "Location"("slug")`;
      console.log('✅ Created unique index on Location.slug');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('ℹ️  Index already exists on Location.slug');
      } else throw e;
    }

    // Generate slugs for existing records
    console.log('\n3. Generating slugs for existing records...');

    // Update Keywords
    const keywordResult = await prisma.$executeRaw`
      UPDATE "Keyword" 
      SET "slug" = LOWER(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE("term", '[^a-zA-Z0-9]+', '-', 'g'),
            '^-+', '', 'g'
          ),
          '-+$', '', 'g'
        )
      )
      WHERE "slug" IS NULL
    `;
    console.log(`✅ Updated ${keywordResult} keyword slugs`);

    // Update Agencies
    const agencyResult = await prisma.$executeRaw`
      UPDATE "Agency" 
      SET "slug" = LOWER(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g'),
            '^-+', '', 'g'
          ),
          '-+$', '', 'g'
        )
      )
      WHERE "slug" IS NULL
    `;
    console.log(`✅ Updated ${agencyResult} agency slugs`);

    // Update Locations
    const locationResult = await prisma.$executeRaw`
      UPDATE "Location" 
      SET "slug" = LOWER(
        REGEXP_REPLACE(
          REGEXP_REPLACE(
            REGEXP_REPLACE("name", '[^a-zA-Z0-9]+', '-', 'g'),
            '^-+', '', 'g'
          ),
          '-+$', '', 'g'
        )
      )
      WHERE "slug" IS NULL
    `;
    console.log(`✅ Updated ${locationResult} location slugs`);

    // Show sample results
    console.log('\n4. Verifying migration...');
    
    const sampleKeywords = await prisma.keyword.findMany({
      take: 5,
      orderBy: { term: 'asc' }
    });
    
    console.log('\nSample Keywords with slugs:');
    sampleKeywords.forEach(k => {
      console.log(`  - ${k.term} → ${k.slug}`);
    });

    const sampleAgencies = await prisma.agency.findMany({
      take: 5,
      orderBy: { name: 'asc' }
    });
    
    console.log('\nSample Agencies with slugs:');
    sampleAgencies.forEach(a => {
      console.log(`  - ${a.name} → ${a.slug}`);
    });

    const sampleLocations = await prisma.location.findMany({
      take: 5,
      orderBy: { name: 'asc' }
    });
    
    console.log('\nSample Locations with slugs:');
    sampleLocations.forEach(l => {
      console.log(`  - ${l.name} → ${l.slug}`);
    });

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
runMigration()
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
const { Client } = require('pg');

const connectionString = 'postgresql://postgres:QvGtdhlYnTiwKhlTqdPihSTQkAtMryTu@switchyard.proxy.rlwy.net:33811/railway';

async function runMigration() {
  const client = new Client({
    connectionString: connectionString,
  });

  try {
    console.log('Connecting to database...');
    await client.connect();
    console.log('✅ Connected successfully\n');

    // Add slug columns
    console.log('1. Adding slug columns...');
    
    try {
      await client.query('ALTER TABLE "Keyword" ADD COLUMN "slug" TEXT');
      console.log('✅ Added slug column to Keyword table');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('ℹ️  Slug column already exists in Keyword table');
      } else throw e;
    }

    try {
      await client.query('ALTER TABLE "Agency" ADD COLUMN "slug" TEXT');
      console.log('✅ Added slug column to Agency table');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('ℹ️  Slug column already exists in Agency table');
      } else throw e;
    }

    try {
      await client.query('ALTER TABLE "Location" ADD COLUMN "slug" TEXT');
      console.log('✅ Added slug column to Location table');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('ℹ️  Slug column already exists in Location table');
      } else throw e;
    }

    // Create indexes
    console.log('\n2. Creating unique indexes...');
    
    try {
      await client.query('CREATE UNIQUE INDEX "Keyword_slug_key" ON "Keyword"("slug")');
      console.log('✅ Created unique index on Keyword.slug');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('ℹ️  Index already exists on Keyword.slug');
      } else throw e;
    }

    try {
      await client.query('CREATE UNIQUE INDEX "Agency_slug_key" ON "Agency"("slug")');
      console.log('✅ Created unique index on Agency.slug');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('ℹ️  Index already exists on Agency.slug');
      } else throw e;
    }

    try {
      await client.query('CREATE UNIQUE INDEX "Location_slug_key" ON "Location"("slug")');
      console.log('✅ Created unique index on Location.slug');
    } catch (e) {
      if (e.message.includes('already exists')) {
        console.log('ℹ️  Index already exists on Location.slug');
      } else throw e;
    }

    // Generate slugs for existing records
    console.log('\n3. Generating slugs for existing records...');

    // Update Keywords
    const keywordResult = await client.query(`
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
    `);
    console.log(`✅ Updated ${keywordResult.rowCount} keyword slugs`);

    // Update Agencies
    const agencyResult = await client.query(`
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
    `);
    console.log(`✅ Updated ${agencyResult.rowCount} agency slugs`);

    // Update Locations
    const locationResult = await client.query(`
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
    `);
    console.log(`✅ Updated ${locationResult.rowCount} location slugs`);

    // Show sample results
    console.log('\n4. Verifying migration...');
    
    const keywordSamples = await client.query('SELECT "term", "slug" FROM "Keyword" ORDER BY "term" LIMIT 10');
    console.log('\nSample Keywords with slugs:');
    keywordSamples.rows.forEach(k => {
      console.log(`  - ${k.term} → ${k.slug}`);
    });

    // Check specifically for EDR
    const edrCheck = await client.query('SELECT "term", "slug" FROM "Keyword" WHERE LOWER("term") = \'edr\'');
    if (edrCheck.rows.length > 0) {
      console.log(`\n✅ Found EDR keyword: ${edrCheck.rows[0].term} → ${edrCheck.rows[0].slug}`);
    }

    const agencySamples = await client.query('SELECT "name", "slug" FROM "Agency" ORDER BY "name" LIMIT 5');
    console.log('\nSample Agencies with slugs:');
    agencySamples.rows.forEach(a => {
      console.log(`  - ${a.name} → ${a.slug}`);
    });

    const locationSamples = await client.query('SELECT "name", "slug" FROM "Location" ORDER BY "name" LIMIT 5');
    console.log('\nSample Locations with slugs:');
    locationSamples.rows.forEach(l => {
      console.log(`  - ${l.name} → ${l.slug}`);
    });

    console.log('\n✅ Migration completed successfully!');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    throw error;
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Run the migration
runMigration()
  .catch(e => {
    console.error(e);
    process.exit(1);
  });
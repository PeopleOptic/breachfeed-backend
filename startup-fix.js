// Temporary startup script to fix database schema issues
const { PrismaClient } = require('@prisma/client');
const fs = require('fs').promises;
const path = require('path');

const prisma = new PrismaClient();

async function fixDatabase() {
  console.log('🔧 Running database fix...');
  
  try {
    // Read the fix SQL script
    const fixSQL = await fs.readFile(path.join(__dirname, 'fix-all-columns.sql'), 'utf8');
    
    // Split by DO blocks and execute each separately
    const statements = fixSQL.split(/DO\s*\$\$/).filter(s => s.trim());
    
    for (let i = 0; i < statements.length; i++) {
      if (statements[i].trim()) {
        const statement = statements[i].includes('$$;') 
          ? 'DO $$' + statements[i] 
          : statements[i];
        
        try {
          console.log(`Executing statement ${i + 1}/${statements.length}...`);
          await prisma.$executeRawUnsafe(statement);
        } catch (error) {
          console.error(`Error in statement ${i + 1}:`, error.message);
          // Continue with other statements
        }
      }
    }
    
    console.log('✅ Database fix completed');
    
    // Verify the fix worked
    const articleColumns = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Article' 
      ORDER BY ordinal_position
    `;
    
    console.log('Article table columns:', articleColumns.map(c => c.column_name));
    
    const agencyColumns = await prisma.$queryRaw`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'Agency' 
      ORDER BY ordinal_position
    `;
    
    console.log('Agency table columns:', agencyColumns.map(c => c.column_name));
    
  } catch (error) {
    console.error('❌ Database fix failed:', error);
    // Don't throw - let the app start anyway
  } finally {
    await prisma.$disconnect();
  }
}

// Run the fix
fixDatabase().then(() => {
  console.log('Starting main application...');
  require('./src/index.js');
}).catch(error => {
  console.error('Startup error:', error);
  process.exit(1);
});
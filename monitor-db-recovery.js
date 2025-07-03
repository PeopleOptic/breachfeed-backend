require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function checkDatabase() {
  const prisma = new PrismaClient();
  
  try {
    // Try a simple query
    const result = await prisma.$queryRaw`SELECT NOW() as current_time`;
    console.log(`✓ Database is accessible! Current time: ${result[0].current_time}`);
    
    // Check article count
    const articleCount = await prisma.article.count();
    console.log(`  Total articles in database: ${articleCount}`);
    
    // Check recent articles with full content
    const recentWithContent = await prisma.article.count({
      where: {
        hasFullContent: true,
        createdAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      }
    });
    console.log(`  Articles with full content (last 24h): ${recentWithContent}`);
    
    await prisma.$disconnect();
    return true;
  } catch (error) {
    console.log(`✗ Database still unavailable: ${error.message}`);
    await prisma.$disconnect();
    return false;
  }
}

async function monitorRecovery() {
  console.log('Monitoring database recovery...');
  console.log('Press Ctrl+C to stop\n');
  
  let isRecovered = false;
  let attempts = 0;
  
  while (!isRecovered) {
    attempts++;
    console.log(`[${new Date().toLocaleTimeString()}] Attempt ${attempts}:`);
    
    isRecovered = await checkDatabase();
    
    if (!isRecovered) {
      console.log('  Waiting 30 seconds before next check...\n');
      await new Promise(resolve => setTimeout(resolve, 30000));
    } else {
      console.log('\n🎉 Database is back online!');
      console.log('You can now start the backend service with: npm start');
    }
  }
}

monitorRecovery().catch(console.error);
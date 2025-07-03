require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function checkArticleStatus() {
  try {
    console.log('Checking Article Status\n');
    console.log('=====================\n');

    // Get total article count
    const totalCount = await prisma.article.count();
    console.log(`Total articles in database: ${totalCount}`);

    // Get recent articles
    const recentArticles = await prisma.article.findMany({
      take: 10,
      orderBy: { publishedAt: 'desc' },
      select: {
        id: true,
        title: true,
        hasFullContent: true,
        alertType: true,
        severity: true,
        publishedAt: true,
        createdAt: true,
        summary: true
      }
    });

    console.log(`\nMost recent ${recentArticles.length} articles:\n`);

    recentArticles.forEach((article, index) => {
      console.log(`${index + 1}. ${article.title}`);
      console.log(`   - Published: ${article.publishedAt.toLocaleString()}`);
      console.log(`   - Has Full Content: ${article.hasFullContent ? '✓' : '✗'}`);
      console.log(`   - Alert Type: ${article.alertType || 'Not set'}`);
      console.log(`   - Severity: ${article.severity || 'Not set'}`);
      console.log(`   - Summary Length: ${article.summary ? article.summary.length + ' chars' : 'No summary'}`);
      console.log(`   - AI Generated: ${article.summary && (article.summary.includes('🚨') || article.summary.includes('⚠️')) ? 'Possibly' : 'Unknown'}`);
      console.log('');
    });

    // Check for articles with full content
    const withFullContent = await prisma.article.count({
      where: { hasFullContent: true }
    });
    console.log(`\nArticles with full content: ${withFullContent}/${totalCount} (${(withFullContent/totalCount*100).toFixed(1)}%)`);

    // Check recent articles (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentCount = await prisma.article.count({
      where: {
        createdAt: { gte: yesterday }
      }
    });
    console.log(`Articles added in last 24 hours: ${recentCount}`);

    // Check RSS feeds
    console.log('\nRSS Feed Status:\n');
    const feeds = await prisma.rssFeed.findMany({
      where: { isActive: true },
      select: {
        name: true,
        lastFetchedAt: true,
        isActive: true
      }
    });

    feeds.forEach(feed => {
      console.log(`- ${feed.name}`);
      console.log(`  Last fetched: ${feed.lastFetchedAt ? feed.lastFetchedAt.toLocaleString() : 'Never'}`);
      if (feed.lastFetchedAt) {
        const minutesAgo = Math.floor((Date.now() - feed.lastFetchedAt.getTime()) / 60000);
        console.log(`  (${minutesAgo} minutes ago)`);
      }
      console.log('');
    });

    // Recommendations
    console.log('\nRecommendations:\n');
    
    if (withFullContent === 0) {
      console.log('⚠️  No articles have full content fetched.');
      console.log('   - Check if ENABLE_FULL_CONTENT_FETCH=true in .env');
      console.log('   - RSS processing might not be running');
    }

    const oldestFetch = Math.min(...feeds.map(f => f.lastFetchedAt ? f.lastFetchedAt.getTime() : Infinity));
    if (oldestFetch < Date.now() - 30 * 60 * 1000) {
      console.log('⚠️  Some feeds haven\'t been fetched in over 30 minutes.');
      console.log('   - RSS cron job might not be running');
      console.log('   - Check server logs for errors');
    }

    if (recentCount === 0) {
      console.log('⚠️  No new articles in the last 24 hours.');
      console.log('   - RSS feeds might not have new content');
      console.log('   - Or RSS processing might be failing');
    } else {
      console.log('✅ RSS feeds are being processed');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkArticleStatus();
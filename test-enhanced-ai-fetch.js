require('dotenv').config();
const { getPrismaClient } = require('./src/utils/database');
const { fetchAndProcessFeed } = require('./src/services/rssService');
const logger = require('./src/utils/logger');

const prisma = getPrismaClient();

async function testEnhancedAIFetch() {
  console.log('Testing Enhanced AI Content Fetching and Summarization\n');
  console.log('=====================================================\n');

  try {
    // Check if AI is configured
    if (!process.env.ANTHROPIC_API_KEY) {
      console.log('⚠️  WARNING: No Anthropic API key found in environment!');
      console.log('Please ensure ANTHROPIC_API_KEY is set in your .env file\n');
    } else {
      console.log('✅ Anthropic API key is configured\n');
    }

    // Get a sample feed to test with
    const testFeed = await prisma.rssFeed.findFirst({
      where: { isActive: true },
      take: 1
    });

    if (!testFeed) {
      console.log('❌ No active RSS feed found in database');
      process.exit(1);
    }

    console.log(`Testing with feed: ${testFeed.name}`);
    console.log(`Feed URL: ${testFeed.url}`);
    console.log('---\n');

    // Get article count before processing
    const beforeCount = await prisma.article.count();
    const beforeAICount = await prisma.article.count({
      where: { summary: { not: null } }
    });

    console.log(`Articles before: ${beforeCount}`);
    console.log(`Articles with AI summaries before: ${beforeAICount}\n`);

    // Process the feed
    console.log('Processing feed with enhanced AI summarization...\n');
    await fetchAndProcessFeed(testFeed);

    // Get article count after processing
    const afterCount = await prisma.article.count();
    const afterAICount = await prisma.article.count({
      where: { summary: { not: null } }
    });

    console.log('\n✅ Feed processing complete!\n');
    console.log(`Articles after: ${afterCount}`);
    console.log(`Articles with AI summaries after: ${afterAICount}`);
    console.log(`New articles added: ${afterCount - beforeCount}`);
    console.log(`New AI summaries: ${afterAICount - beforeAICount}\n`);

    // Show recent articles with AI content
    if (afterCount > beforeCount) {
      console.log('Recent articles with AI enhancement:\n');
      
      const recentArticles = await prisma.article.findMany({
        take: 3,
        orderBy: { createdAt: 'desc' },
        select: {
          title: true,
          summary: true,
          recommendations: true,
          alertType: true,
          severity: true,
          hasFullContent: true,
          createdAt: true
        }
      });

      recentArticles.forEach((article, index) => {
        console.log(`${index + 1}. ${article.title}`);
        console.log(`   - Created: ${article.createdAt}`);
        console.log(`   - Full Content: ${article.hasFullContent ? 'Yes' : 'No'}`);
        console.log(`   - Alert Type: ${article.alertType}`);
        console.log(`   - Severity: ${article.severity}`);
        if (article.summary) {
          console.log(`   - AI Summary: ${article.summary.substring(0, 100)}...`);
        } else {
          console.log(`   - AI Summary: None`);
        }
        console.log('');
      });
    }

  } catch (error) {
    console.error('❌ Error during testing:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testEnhancedAIFetch();
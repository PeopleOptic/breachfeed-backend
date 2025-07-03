require('dotenv').config();
const axios = require('axios');

async function verifyRSSProcessing() {
  const API_URL = 'http://localhost:3000/api';
  const API_KEY = process.env.WORDPRESS_API_KEY;

  console.log('RSS Processing Verification Tool');
  console.log('================================\n');

  try {
    // First check if the server is running
    console.log('1. Checking server status...');
    try {
      await axios.get(`${API_URL}/health`);
      console.log('✓ Server is running\n');
    } catch (error) {
      console.log('✗ Server is not running. Please start it first.\n');
      return;
    }

    // Get recent articles
    console.log('2. Fetching recent articles...');
    const articlesResponse = await axios.get(`${API_URL}/articles`, {
      headers: { 'X-API-Key': API_KEY },
      params: { limit: 10 }
    });

    const articles = articlesResponse.data;
    console.log(`✓ Found ${articles.length} recent articles\n`);

    // Analyze articles
    console.log('3. Analyzing article content:');
    let withFullContent = 0;
    let withAISummary = 0;
    let withoutContent = 0;

    articles.forEach(article => {
      const hasContent = article.hasFullContent;
      const hasSummary = article.summary && article.summary.length > 100;
      
      if (hasContent) withFullContent++;
      if (hasSummary) withAISummary++;
      if (!hasContent && !hasSummary) withoutContent++;

      console.log(`\n   Article: ${article.title.substring(0, 50)}...`);
      console.log(`   - Full Content: ${hasContent ? '✓' : '✗'} (${article.fullContent?.length || 0} chars)`);
      console.log(`   - AI Summary: ${hasSummary ? '✓' : '✗'} (${article.summary?.length || 0} chars)`);
      console.log(`   - Alert Type: ${article.alertType || 'None'}`);
      console.log(`   - Published: ${new Date(article.publishedAt).toLocaleString()}`);
    });

    console.log('\n4. Summary:');
    console.log(`   - Articles with full content: ${withFullContent}/${articles.length}`);
    console.log(`   - Articles with AI summaries: ${withAISummary}/${articles.length}`);
    console.log(`   - Articles without processing: ${withoutContent}/${articles.length}`);

    // Check RSS feed status
    console.log('\n5. Checking RSS feed processing...');
    try {
      const feedsResponse = await axios.get(`${API_URL}/rss/feeds`, {
        headers: { 'X-API-Key': API_KEY }
      });
      const feeds = feedsResponse.data;
      console.log(`✓ Found ${feeds.length} active RSS feeds`);
      
      feeds.forEach(feed => {
        console.log(`   - ${feed.name}: Last fetched ${feed.lastFetchedAt ? new Date(feed.lastFetchedAt).toLocaleString() : 'Never'}`);
      });
    } catch (error) {
      console.log('✗ Could not fetch RSS feed status');
    }

    // Recommendations
    console.log('\n6. Recommendations:');
    if (withFullContent === 0) {
      console.log('   ⚠️  No articles have full content. Check:');
      console.log('      - ENABLE_FULL_CONTENT_FETCH=true in .env');
      console.log('      - Content fetch service logs for errors');
      console.log('      - Network connectivity to article URLs');
    }
    if (withAISummary < articles.length * 0.5) {
      console.log('   ⚠️  Less than 50% of articles have AI summaries. Check:');
      console.log('      - AI service configuration');
      console.log('      - Error logs in RSS processing');
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.response) {
      console.error('Response:', error.response.status, error.response.data);
    }
  }
}

// Run verification
verifyRSSProcessing().catch(console.error);
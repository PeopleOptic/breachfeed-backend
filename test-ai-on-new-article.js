require('dotenv').config();
const AIService = require('./src/services/aiService');
const contentFetchService = require('./src/services/contentFetchService');
const logger = require('./src/utils/logger');

async function testAIOnNewArticle() {
  console.log('Testing AI Summary on a New Article with Full Content Fetch\n');
  console.log('=========================================================\n');

  // Test with a real cybersecurity article URL
  const testUrl = 'https://thehackernews.com/2025/01/cisco-patches-critical-vulnerability-in.html';
  
  const testArticle = {
    title: "Test Article: Cisco Patches Critical Vulnerability",
    description: "Testing AI summarization with full content fetching",
    content: "", // Will be filled by content fetch
    link: testUrl,
    publishedAt: new Date()
  };

  try {
    // Step 1: Attempt to fetch full content
    console.log('1. Fetching full article content...');
    console.log(`   URL: ${testUrl}\n`);
    
    let fullContent = null;
    let hasFullContent = false;
    
    try {
      fullContent = await contentFetchService.fetchArticleContent(testUrl);
      if (fullContent && fullContent.textContent) {
        hasFullContent = true;
        console.log(`✅ Successfully fetched ${fullContent.textContent.length} characters of content`);
        console.log(`   Title from page: ${fullContent.title || 'N/A'}`);
        console.log(`   Excerpt: ${fullContent.excerpt?.substring(0, 100)}...`);
        
        // Update article with fetched content
        testArticle.content = fullContent.textContent;
        if (fullContent.title) {
          testArticle.title = fullContent.title;
        }
      } else {
        console.log('⚠️  Could not fetch full content');
      }
    } catch (fetchError) {
      console.log(`❌ Content fetch failed: ${fetchError.message}`);
    }
    
    console.log('\n2. Generating AI Summary...\n');
    
    // Step 2: Generate AI summary
    let aiSummary;
    if (hasFullContent) {
      console.log('   Using comprehensive summary with full content...');
      aiSummary = await AIService.generateComprehensiveSummary(testArticle, fullContent);
    } else {
      console.log('   Using basic summary with RSS content...');
      aiSummary = await AIService.generateIncidentSummary(testArticle);
    }
    
    // Step 3: Display results
    console.log('\n3. AI Summary Results:\n');
    console.log('====================\n');
    
    console.log('Classification:');
    console.log(`- Alert Type: ${aiSummary.alertType}`);
    console.log(`- Severity: ${aiSummary.severity}`);
    console.log(`- Incident Type: ${aiSummary.incidentType || 'N/A'}`);
    console.log(`- AI Generated: ${aiSummary.aiGenerated ? 'Yes' : 'No (Template)'}`);
    console.log(`- Confidence: ${aiSummary.classificationConfidence || 'N/A'}\n`);
    
    console.log('Summary:');
    console.log(aiSummary.summary);
    console.log('');
    
    if (aiSummary.keyFacts && aiSummary.keyFacts.length > 0) {
      console.log('Key Facts:');
      aiSummary.keyFacts.forEach(fact => console.log(`• ${fact}`));
      console.log('');
    }
    
    if (aiSummary.recommendations) {
      console.log('Recommendations:');
      console.log(aiSummary.recommendations);
      console.log('');
    }
    
    if (aiSummary.extractedEntities) {
      console.log('Extracted Entities:');
      if (aiSummary.extractedEntities.companies?.length > 0) {
        console.log(`- Companies: ${aiSummary.extractedEntities.companies.join(', ')}`);
      }
      if (aiSummary.extractedEntities.agencies?.length > 0) {
        console.log(`- Agencies: ${aiSummary.extractedEntities.agencies.join(', ')}`);
      }
      if (aiSummary.extractedEntities.locations?.length > 0) {
        console.log(`- Locations: ${aiSummary.extractedEntities.locations.join(', ')}`);
      }
    }
    
    console.log('\n✅ Test complete!');
    
  } catch (error) {
    console.error('\n❌ Error during test:', error);
  }
  
  process.exit(0);
}

// Run the test
testAIOnNewArticle();
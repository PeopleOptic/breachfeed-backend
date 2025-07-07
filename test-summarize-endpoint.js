require('dotenv').config();
const axios = require('axios');
const { getPrismaClient } = require('./src/utils/database');

const prisma = getPrismaClient();

async function testSummarizeEndpoint() {
  console.log('Testing On-Demand Summarize Endpoint\n');
  console.log('====================================\n');

  const API_URL = 'http://localhost:' + (process.env.PORT || 3000);
  const API_KEY = process.env.API_KEY || 'test-api-key';

  try {
    // Find an article without full content (good candidate for summarization)
    let testArticle = await prisma.article.findFirst({
      where: {
        hasFullContent: false
      },
      orderBy: { createdAt: 'desc' }
    });
    
    // If no article without full content, just use the most recent one
    if (!testArticle) {
      testArticle = await prisma.article.findFirst({
        orderBy: { createdAt: 'desc' }
      });
    }

    if (!testArticle) {
      console.log('No suitable test article found. Creating one...');
      // You could create a test article here if needed
      process.exit(0);
    }

    console.log('Test Article:', testArticle.title);
    console.log('Article ID:', testArticle.id);
    console.log('Has Summary:', !!testArticle.summary);
    console.log('Has Full Content:', testArticle.hasFullContent);
    console.log('Source URL:', testArticle.link);
    console.log('\n---\n');

    // Get or create a test user
    let testUser = await prisma.user.findFirst({
      where: { email: 'test@example.com' }
    });

    if (!testUser) {
      testUser = await prisma.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          isActive: true
        }
      });
      console.log('Created test user');
    }

    console.log('Making summarize request...\n');

    // Test the summarize endpoint
    const response = await axios.post(
      `${API_URL}/api/articles/${testArticle.id}/summarize`,
      {},
      {
        headers: {
          'X-API-Key': API_KEY,
          'X-User-Id': testUser.id,
          'X-User-Email': testUser.email,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Response Status:', response.status);
    console.log('\nResponse Data:');
    console.log('- Message:', response.data.message);
    console.log('- Has Summary:', !!response.data.summary);
    console.log('- Has Full Content:', response.data.hasFullContent);
    console.log('- AI Generated:', response.data.aiGenerated);
    console.log('- Alert Type:', response.data.alertType);
    console.log('- Severity:', response.data.severity);

    if (response.data.summary) {
      console.log('\nGenerated Summary (first 200 chars):');
      console.log(response.data.summary.substring(0, 200) + '...');
    }

    if (response.data.recommendations) {
      console.log('\nRecommendations (first 200 chars):');
      console.log(response.data.recommendations.substring(0, 200) + '...');
    }

    // Verify the article was updated in the database
    const updatedArticle = await prisma.article.findUnique({
      where: { id: testArticle.id }
    });

    console.log('\n✅ Article Updated in Database:');
    console.log('- Summary Length:', updatedArticle.summary?.length || 0);
    console.log('- Has Full Content:', updatedArticle.hasFullContent);
    console.log('- Alert Type:', updatedArticle.alertType);
    console.log('- Severity:', updatedArticle.severity);

  } catch (error) {
    console.error('\n❌ Error testing summarize endpoint:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error(error.message);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Run the test
testSummarizeEndpoint();
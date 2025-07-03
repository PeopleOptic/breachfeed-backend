require('dotenv').config();
const { getPrismaClient } = require('./src/utils/database');
const { generateContextualRecommendations } = require('./src/services/recommendationService');
const logger = require('./src/utils/logger');

const prisma = getPrismaClient();

async function enhanceArticleRecommendations() {
  console.log('Enhancing article recommendations with AI...\n');
  
  try {
    // Get recent articles with generic recommendations
    const articles = await prisma.article.findMany({
      where: {
        OR: [
          { recommendations: { contains: 'PROACTIVE MEASURES RECOMMENDED' } },
          { recommendations: { contains: 'Review your security posture' } }
        ],
        hasFullContent: true,
        publishedAt: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
        }
      },
      take: 5,
      orderBy: { publishedAt: 'desc' }
    });
    
    console.log(`Found ${articles.length} articles with generic recommendations\n`);
    
    for (const article of articles) {
      console.log(`\nEnhancing: ${article.title.substring(0, 60)}...`);
      console.log(`Current recommendations length: ${article.recommendations?.length || 0} chars`);
      
      try {
        // Generate new contextual recommendations
        const newRecommendations = await generateContextualRecommendations(article, article.content);
        
        if (newRecommendations) {
          // Update the article
          await prisma.article.update({
            where: { id: article.id },
            data: { recommendations: newRecommendations }
          });
          
          console.log('✓ Updated with AI-generated recommendations');
          console.log(`New recommendations length: ${newRecommendations.length} chars`);
          
          // Show a preview
          console.log('\nPreview of new recommendations:');
          console.log(newRecommendations.substring(0, 300) + '...\n');
        } else {
          console.log('✗ Failed to generate new recommendations');
        }
      } catch (error) {
        console.error(`✗ Error: ${error.message}`);
      }
    }
    
    console.log('\n✅ Enhancement complete!');
    
    // Show example of enhanced vs generic
    if (articles.length > 0) {
      const exampleArticle = await prisma.article.findUnique({
        where: { id: articles[0].id }
      });
      
      console.log('\n--- COMPARISON ---');
      console.log('\nGeneric Recommendations (OLD):');
      console.log('ℹ️ PROACTIVE MEASURES RECOMMENDED:\n1. Review your security posture\n2. Ensure patches are up to date...\n');
      
      console.log('AI-Powered Recommendations (NEW):');
      console.log(exampleArticle.recommendations?.substring(0, 500) + '...');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

enhanceArticleRecommendations();
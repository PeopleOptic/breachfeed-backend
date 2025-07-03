require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const contentFetchService = require('./src/services/contentFetchService');
const AIService = require('./src/services/aiService');
const logger = require('./src/utils/logger');

const prisma = new PrismaClient();

async function forceContentUpdate() {
  console.log('Forcing content update on recent articles without full content...\n');
  
  try {
    // Get recent articles without full content
    const articles = await prisma.article.findMany({
      where: {
        hasFullContent: false,
        publishedAt: {
          gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
        }
      },
      take: 5,
      orderBy: { publishedAt: 'desc' }
    });
    
    console.log(`Found ${articles.length} recent articles without full content\n`);
    
    for (const article of articles) {
      console.log(`\nProcessing: ${article.title}`);
      console.log(`URL: ${article.link}`);
      
      try {
        // Fetch full content
        console.log('Fetching content...');
        const fullContent = await contentFetchService.fetchArticleContent(article.link);
        
        if (fullContent && fullContent.textContent && fullContent.textContent.length > 1000) {
          console.log(`✓ Fetched ${fullContent.textContent.length} characters`);
          
          // Generate AI summary
          console.log('Generating AI summary...');
          const aiData = await AIService.generateComprehensiveSummary(article, fullContent);
          
          // Update article
          const updateData = {
            hasFullContent: true,
            fullContent: fullContent.textContent,
            fullContentHtml: fullContent.htmlContent
          };
          
          if (aiData && typeof aiData === 'object') {
            updateData.summary = aiData.summary || article.summary;
            updateData.alertType = aiData.alertType || article.alertType;
            updateData.severity = aiData.severity || article.severity;
            updateData.incidentType = aiData.incidentType || article.incidentType;
            
            if (aiData.aiGenerated) {
              console.log('✓ AI summary generated successfully');
            }
          }
          
          await prisma.article.update({
            where: { id: article.id },
            data: updateData
          });
          
          console.log('✓ Article updated successfully');
        } else {
          console.log(`✗ Insufficient content fetched (${fullContent?.textContent?.length || 0} chars)`);
        }
      } catch (error) {
        console.error(`✗ Error: ${error.message}`);
      }
    }
    
    console.log('\n✅ Content update complete!');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

forceContentUpdate();
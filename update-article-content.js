require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const contentFetchService = require('./src/services/contentFetchService');
const AIService = require('./src/services/aiService');
const logger = require('./src/utils/logger');

const prisma = new PrismaClient();

async function updateArticleContent() {
  console.log('Updating articles with full content and AI summaries...\n');
  
  try {
    // Get recent articles without full content
    const articles = await prisma.article.findMany({
      where: {
        hasFullContent: false,
        publishedAt: {
          gte: new Date(Date.now() - 48 * 60 * 60 * 1000) // Last 48 hours
        }
      },
      take: 10,
      orderBy: { publishedAt: 'desc' }
    });
    
    console.log(`Found ${articles.length} articles to update\n`);
    
    let successCount = 0;
    
    for (const article of articles) {
      console.log(`\nProcessing: ${article.title.substring(0, 60)}...`);
      
      try {
        // Skip certain domains that block scraping
        if (article.link.includes('darkreading.com')) {
          console.log('⚠️  Skipping Dark Reading (blocks scraping)');
          continue;
        }
        
        // Fetch full content
        const fullContent = await contentFetchService.fetchArticleContent(article.link);
        
        if (fullContent && fullContent.textContent && fullContent.textContent.length > 1000) {
          console.log(`✓ Fetched ${fullContent.textContent.length} characters`);
          
          // Generate AI summary
          const aiData = await AIService.generateComprehensiveSummary(article, fullContent);
          
          // Update article - store full content in the content field
          const updateData = {
            hasFullContent: true,
            content: fullContent.textContent, // Store scraped content here
            updatedAt: new Date()
          };
          
          if (aiData && typeof aiData === 'object') {
            if (aiData.summary) updateData.summary = aiData.summary;
            if (aiData.alertType) updateData.alertType = aiData.alertType;
            if (aiData.severity) updateData.severity = aiData.severity;
            if (aiData.recommendations) updateData.recommendations = aiData.recommendations;
            
            console.log(`✓ AI summary generated (${aiData.aiGenerated ? 'AI' : 'Template'})`);
            console.log(`  Alert: ${aiData.alertType}, Severity: ${aiData.severity}`);
          }
          
          await prisma.article.update({
            where: { id: article.id },
            data: updateData
          });
          
          successCount++;
          console.log('✓ Article updated successfully');
        } else {
          console.log(`✗ Insufficient content (${fullContent?.textContent?.length || 0} chars)`);
        }
      } catch (error) {
        console.error(`✗ Error: ${error.message}`);
      }
    }
    
    console.log(`\n✅ Update complete! Successfully updated ${successCount}/${articles.length} articles`);
    
    // Show summary of articles with full content
    const totalWithContent = await prisma.article.count({
      where: { hasFullContent: true }
    });
    const total = await prisma.article.count();
    
    console.log(`\nDatabase Status:`);
    console.log(`- Total articles: ${total}`);
    console.log(`- With full content: ${totalWithContent} (${(totalWithContent/total*100).toFixed(1)}%)`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updateArticleContent();
const { getPrismaClient } = require('../utils/database');
const logger = require('../utils/logger');
const Anthropic = require('@anthropic-ai/sdk');

const prisma = getPrismaClient();

// Initialize Anthropic client if API key is available
const anthropicClient = process.env.ANTHROPIC_API_KEY ? 
  new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  }) : null;

/**
 * Generate AI-powered contextual recommendations for an article
 */
async function generateContextualRecommendations(article, fullContent = null) {
  try {
    if (!anthropicClient) {
      logger.warn('Anthropic client not available for recommendations');
      return null;
    }

    const contentToAnalyze = fullContent || article.content || `${article.title} ${article.description}`;
    
    const prompt = `You are a cybersecurity expert providing actionable recommendations based on a security incident.

Article Title: ${article.title}
Alert Type: ${article.alertType}
Severity: ${article.severity}
Incident Type: ${article.incidentType || 'Unknown'}

Article Content:
${contentToAnalyze.substring(0, 4000)}

Please provide SPECIFIC, ACTIONABLE recommendations that are:
1. Tailored to this exact threat/incident
2. Organized by priority (Immediate, Short-term, Long-term)
3. Include specific tools, commands, or configurations where applicable
4. Reference relevant security frameworks or standards
5. Consider different organization sizes (small business vs enterprise)

Format your response as structured recommendations that security teams can immediately act upon. Include:
- Detection methods
- Mitigation steps
- Prevention measures
- Monitoring recommendations
- Specific patches or updates if mentioned in the article

Keep recommendations practical and avoid generic advice.`;

    const response = await anthropicClient.messages.create({
      model: 'claude-3-haiku-20240307',
      max_tokens: 800,
      temperature: 0.3,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });

    const recommendations = response.content[0].text;
    logger.info('Generated contextual recommendations for article:', article.id);
    
    return recommendations;

  } catch (error) {
    logger.error('Error generating contextual recommendations:', error);
    return null;
  }
}

/**
 * Update article with enhanced recommendations
 */
async function updateArticleRecommendations(articleId, recommendations) {
  try {
    await prisma.article.update({
      where: { id: articleId },
      data: { recommendations }
    });
    
    logger.info('Updated article recommendations:', articleId);
  } catch (error) {
    logger.error('Error updating article recommendations:', error);
  }
}

/**
 * Generate recommendations for existing articles without them
 */
async function enhanceExistingArticles(limit = 10) {
  try {
    // Find articles with generic or no recommendations
    const articles = await prisma.article.findMany({
      where: {
        OR: [
          { recommendations: null },
          { recommendations: { contains: 'PROACTIVE MEASURES RECOMMENDED' } }
        ],
        hasFullContent: true
      },
      take: limit,
      orderBy: { publishedAt: 'desc' }
    });

    logger.info(`Found ${articles.length} articles to enhance with recommendations`);

    for (const article of articles) {
      const recommendations = await generateContextualRecommendations(article);
      if (recommendations) {
        await updateArticleRecommendations(article.id, recommendations);
      }
    }

    return articles.length;
  } catch (error) {
    logger.error('Error enhancing existing articles:', error);
    return 0;
  }
}

module.exports = {
  generateContextualRecommendations,
  updateArticleRecommendations,
  enhanceExistingArticles
};
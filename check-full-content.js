const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkFullContent() {
  try {
    const articles = await prisma.article.findMany({
      where: {
        hasFullContent: true
      },
      select: {
        id: true,
        title: true,
        hasFullContent: true,
        createdAt: true,
        content: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 5
    });
    
    console.log('Articles with full content:', articles.length);
    articles.forEach(article => {
      const contentLength = article.content ? article.content.length : 0;
      console.log(`- ${article.title.substring(0, 60)}... (${contentLength} chars)`);
    });
    
    const total = await prisma.article.count();
    const withFullContent = await prisma.article.count({ where: { hasFullContent: true } });
    const percentage = total > 0 ? ((withFullContent/total)*100).toFixed(1) : 0;
    
    console.log(`\nTotal articles: ${total}`);
    console.log(`With full content: ${withFullContent} (${percentage}%)`);
    
    // Check recent articles without full content
    const withoutFullContent = await prisma.article.findMany({
      where: {
        hasFullContent: false
      },
      select: {
        title: true,
        link: true,
        createdAt: true
      },
      orderBy: {
        createdAt: 'desc'
      },
      take: 3
    });
    
    if (withoutFullContent.length > 0) {
      console.log('\nRecent articles WITHOUT full content:');
      withoutFullContent.forEach(article => {
        console.log(`- ${article.title.substring(0, 50)}...`);
        console.log(`  ${article.link}`);
      });
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

checkFullContent();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Function to generate slug from title
function generateSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

async function migrateArticleSlugs() {
  try {
    console.log('Starting article slug migration...');
    
    // Get all articles without slugs
    const articles = await prisma.article.findMany({
      where: {
        slug: null
      },
      select: {
        id: true,
        title: true
      }
    });
    
    console.log(`Found ${articles.length} articles without slugs`);
    
    let updated = 0;
    let errors = 0;
    const slugCounts = new Map();
    
    // Process articles in batches of 100
    const batchSize = 100;
    for (let i = 0; i < articles.length; i += batchSize) {
      const batch = articles.slice(i, Math.min(i + batchSize, articles.length));
      
      const updatePromises = batch.map(async (article) => {
        try {
          let baseSlug = generateSlug(article.title);
          let slug = baseSlug;
          
          // Handle duplicate slugs by appending numbers
          let count = slugCounts.get(baseSlug) || 0;
          if (count > 0) {
            slug = `${baseSlug}-${count + 1}`;
          }
          slugCounts.set(baseSlug, count + 1);
          
          // Check if slug already exists in database
          let existingCount = 0;
          let finalSlug = slug;
          
          while (true) {
            const existing = await prisma.article.findUnique({
              where: { slug: finalSlug }
            });
            
            if (!existing) break;
            
            existingCount++;
            finalSlug = `${baseSlug}-${count + existingCount + 1}`;
          }
          
          // Update article with slug
          await prisma.article.update({
            where: { id: article.id },
            data: { slug: finalSlug }
          });
          
          updated++;
          
          if (updated % 100 === 0) {
            console.log(`Updated ${updated} articles...`);
          }
        } catch (error) {
          console.error(`Error updating article ${article.id}:`, error.message);
          errors++;
        }
      });
      
      await Promise.all(updatePromises);
    }
    
    console.log('\nMigration complete!');
    console.log(`Successfully updated: ${updated} articles`);
    console.log(`Errors: ${errors}`);
    
    // Also update voteCount for articles with votes
    console.log('\nUpdating vote counts...');
    const articlesWithVotes = await prisma.article.findMany({
      where: {
        votes: {
          some: {}
        }
      },
      include: {
        votes: true
      }
    });
    
    for (const article of articlesWithVotes) {
      const upvotes = article.votes.filter(v => v.vote === 'UP').length;
      const downvotes = article.votes.filter(v => v.vote === 'DOWN').length;
      const voteCount = upvotes - downvotes;
      
      await prisma.article.update({
        where: { id: article.id },
        data: { voteCount }
      });
    }
    
    console.log(`Updated vote counts for ${articlesWithVotes.length} articles`);
    
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the migration
migrateArticleSlugs();
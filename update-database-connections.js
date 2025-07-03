const fs = require('fs');
const path = require('path');

// Files to update (excluding database.js itself)
const filesToUpdate = [
  'src/services/aiService.js',
  'src/routes/articles.js',
  'src/middleware/optionalUserIdentification.js',
  'src/routes/dashboard.js',
  'src/routes/companies.js',
  'src/services/rssService.js',
  'src/routes/subscriptions.js',
  'src/index.js',
  'src/routes/exclusionKeywords.js',
  'src/middleware/userIdentification.js',
  'src/services/notificationService.js',
  'src/services/matchingService.js',
  'src/routes/webhooks.js',
  'src/routes/notifications.js',
  'src/routes/users.js',
  'src/routes/feeds.js',
  'src/services/cleanupService.js'
];

console.log('Updating database connections to use centralized pool...\n');

filesToUpdate.forEach(filePath => {
  try {
    const fullPath = path.join(__dirname, filePath);
    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Check if file has PrismaClient import
    if (!content.includes('PrismaClient')) {
      console.log(`⚠️  ${filePath} - No PrismaClient found`);
      return;
    }
    
    // Replace PrismaClient import
    content = content.replace(
      /const\s*{\s*PrismaClient\s*}\s*=\s*require\(['"]@prisma\/client['"]\);?/g,
      "const { getPrismaClient } = require('../utils/database');"
    );
    
    // Handle relative path differences for different directories
    if (filePath.includes('routes/') || filePath.includes('middleware/')) {
      content = content.replace(
        "require('../utils/database')",
        "require('../utils/database')"
      );
    } else if (filePath.includes('services/')) {
      content = content.replace(
        "require('../utils/database')",
        "require('../utils/database')"
      );
    } else if (filePath === 'src/index.js') {
      content = content.replace(
        "require('../utils/database')",
        "require('./utils/database')"
      );
    }
    
    // Replace new PrismaClient() with getPrismaClient()
    content = content.replace(
      /const\s+prisma\s*=\s*new\s+PrismaClient\(\);?/g,
      'const prisma = getPrismaClient();'
    );
    
    // Write updated content
    fs.writeFileSync(fullPath, content);
    console.log(`✅ ${filePath} - Updated`);
    
  } catch (error) {
    console.error(`❌ ${filePath} - Error: ${error.message}`);
  }
});

console.log('\n✅ Database connection updates complete!');
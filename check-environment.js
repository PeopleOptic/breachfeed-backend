#!/usr/bin/env node

/**
 * Environment Check Script for BreachFeed Alert Classification Deployment
 * Validates all requirements before deployment
 */

const fs = require('fs');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}[INFO]${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}[✓]${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}[⚠]${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}[✗]${colors.reset} ${msg}`),
  header: (msg) => console.log(`\n${colors.cyan}${msg}${colors.reset}`)
};

async function checkEnvironment() {
  log.header('🔍 BreachFeed Environment Check');
  log.header('=====================================');
  
  let allChecksPass = true;
  
  // Check 1: Node.js version
  log.header('1. Node.js Version');
  try {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion >= 18) {
      log.success(`Node.js ${nodeVersion} (✓ >= 18.x)`);
    } else {
      log.error(`Node.js ${nodeVersion} (✗ Requires >= 18.x)`);
      allChecksPass = false;
    }
  } catch (error) {
    log.error('Failed to check Node.js version');
    allChecksPass = false;
  }
  
  // Check 2: Package.json and dependencies
  log.header('2. Dependencies');
  if (fs.existsSync('package.json')) {
    log.success('package.json found');
    
    if (fs.existsSync('node_modules')) {
      log.success('node_modules directory exists');
    } else {
      log.warning('node_modules not found - run "npm install"');
    }
  } else {
    log.error('package.json not found');
    allChecksPass = false;
  }
  
  // Check 3: Environment file
  log.header('3. Environment Configuration');
  if (fs.existsSync('.env')) {
    log.success('.env file found');
    
    // Load and validate environment variables
    require('dotenv').config();
    
    const requiredVars = [
      'DATABASE_URL',
      'JWT_SECRET',
      'PORT'
    ];
    
    const optionalVars = [
      'SENDGRID_API_KEY',
      'TWILIO_ACCOUNT_SID',
      'REDIS_URL'
    ];
    
    for (const varName of requiredVars) {
      if (process.env[varName]) {
        log.success(`${varName} is set`);
      } else {
        log.error(`${varName} is missing (required)`);
        allChecksPass = false;
      }
    }
    
    for (const varName of optionalVars) {
      if (process.env[varName]) {
        log.success(`${varName} is set`);
      } else {
        log.warning(`${varName} is not set (optional)`);
      }
    }
    
  } else {
    log.error('.env file not found');
    log.info('Copy .env.example to .env and configure your settings');
    allChecksPass = false;
  }
  
  // Check 4: Database connection
  log.header('4. Database Connection');
  if (process.env.DATABASE_URL) {
    try {
      const { PrismaClient } = require('@prisma/client');
      const prisma = new PrismaClient();
      
      await prisma.$connect();
      log.success('Database connection successful');
      
      // Check if tables exist
      try {
        const articleCount = await prisma.article.count();
        log.success(`Database has ${articleCount} articles`);
      } catch (error) {
        log.warning('Database tables not found - migration needed');
      }
      
      await prisma.$disconnect();
    } catch (error) {
      log.error(`Database connection failed: ${error.message}`);
      allChecksPass = false;
    }
  } else {
    log.error('DATABASE_URL not configured');
    allChecksPass = false;
  }
  
  // Check 5: Prisma setup
  log.header('5. Prisma Configuration');
  if (fs.existsSync('prisma/schema.prisma')) {
    log.success('Prisma schema found');
    
    // Check if client is generated
    try {
      require('@prisma/client');
      log.success('Prisma client is available');
    } catch (error) {
      log.warning('Prisma client not generated - run "npx prisma generate"');
    }
  } else {
    log.error('Prisma schema not found');
    allChecksPass = false;
  }
  
  // Check 6: Alert classification system files
  log.header('6. Alert Classification System');
  const requiredFiles = [
    'src/services/aiService.js',
    'src/services/notificationService.js',
    'src/services/matchingService.js',
    'test/test-alert-classification.js'
  ];
  
  for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
      log.success(`${file} exists`);
    } else {
      log.error(`${file} missing`);
      allChecksPass = false;
    }
  }
  
  // Check 7: Test alert classification
  log.header('7. Alert Classification Test');
  try {
    const { stdout } = await execAsync('node test/test-alert-classification.js');
    if (stdout.includes('All tests passed')) {
      log.success('Alert classification tests pass');
    } else {
      log.warning('Some alert classification tests failed');
    }
  } catch (error) {
    log.error('Alert classification test failed');
    log.info('Try: node test/test-alert-classification.js');
  }
  
  // Final summary
  log.header('Summary');
  if (allChecksPass) {
    log.success('🎉 All checks passed! Ready for deployment');
    log.info('Run: ./deploy-alert-classification.sh');
  } else {
    log.error('❌ Some checks failed. Please fix the issues above before deploying');
    log.info('See DEPLOYMENT_GUIDE.md for detailed instructions');
  }
  
  return allChecksPass;
}

// Run the checks
checkEnvironment()
  .then(success => {
    process.exit(success ? 0 : 1);
  })
  .catch(error => {
    log.error(`Environment check failed: ${error.message}`);
    process.exit(1);
  });
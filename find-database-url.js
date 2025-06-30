#!/usr/bin/env node

/**
 * Database URL Finder for BreachFeed
 * Helps determine the correct DATABASE_URL for your setup
 */

const { execSync } = require('child_process');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const colors = {
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  reset: '\x1b[0m'
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

async function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function testDatabaseConnection(url) {
  try {
    // Create a temporary test connection
    const testScript = `
      const { Client } = require('pg');
      const client = new Client({ connectionString: '${url}' });
      client.connect()
        .then(() => {
          console.log('SUCCESS');
          return client.end();
        })
        .catch((err) => {
          console.log('FAILED:', err.message);
          process.exit(1);
        });
    `;
    
    const result = execSync(`node -e "${testScript}"`, { encoding: 'utf8', timeout: 5000 });
    return result.includes('SUCCESS');
  } catch (error) {
    return false;
  }
}

async function findDatabaseUrl() {
  console.log(`${colors.blue}🔍 BreachFeed Database URL Finder${colors.reset}`);
  console.log('=====================================\n');
  
  // Check if PostgreSQL is running
  try {
    execSync('lsof -i :5432', { stdio: 'ignore' });
    log(colors.green, '✅ PostgreSQL is running on port 5432');
  } catch (error) {
    log(colors.yellow, '⚠️  PostgreSQL may not be running on port 5432');
    
    const startPg = await question('Would you like to try starting PostgreSQL? (y/n): ');
    if (startPg.toLowerCase() === 'y') {
      try {
        execSync('brew services start postgresql', { stdio: 'inherit' });
        log(colors.green, '✅ PostgreSQL started');
      } catch (error) {
        log(colors.red, '❌ Could not start PostgreSQL with Homebrew');
      }
    }
  }
  
  console.log('\nLet\'s test some common database configurations...\n');
  
  // Common configurations to test
  const testConfigs = [
    {
      name: 'Default with user "jbg" (no password)',
      url: 'postgresql://jbg:@localhost:5432/breachfeed'
    },
    {
      name: 'Default with user "postgres" (no password)',
      url: 'postgresql://postgres:@localhost:5432/breachfeed'
    },
    {
      name: 'Standard postgres user with password "postgres"',
      url: 'postgresql://postgres:postgres@localhost:5432/breachfeed'
    },
    {
      name: 'Standard postgres user with password "password"',
      url: 'postgresql://postgres:password@localhost:5432/breachfeed'
    }
  ];
  
  for (const config of testConfigs) {
    console.log(`Testing: ${config.name}`);
    
    if (await testDatabaseConnection(config.url)) {
      log(colors.green, `✅ SUCCESS! This configuration works:`);
      console.log(`\n${colors.yellow}Add this to your .env file:${colors.reset}`);
      console.log(`DATABASE_URL="${config.url}"\n`);
      
      const use = await question('Use this configuration? (y/n): ');
      if (use.toLowerCase() === 'y') {
        return config.url;
      }
    } else {
      log(colors.red, '❌ Failed to connect');
    }
    console.log('');
  }
  
  // Manual configuration
  console.log('None of the common configurations worked. Let\'s try manual setup:\n');
  
  const host = await question('Database host (default: localhost): ') || 'localhost';
  const port = await question('Database port (default: 5432): ') || '5432';
  const username = await question('Database username (default: jbg): ') || 'jbg';
  const password = await question('Database password (leave empty for none): ');
  const database = await question('Database name (default: breachfeed): ') || 'breachfeed';
  
  const passwordPart = password ? `:${password}` : '';
  const manualUrl = `postgresql://${username}${passwordPart}@${host}:${port}/${database}`;
  
  console.log(`\nTesting manual configuration: ${manualUrl}`);
  
  if (await testDatabaseConnection(manualUrl)) {
    log(colors.green, '✅ Manual configuration works!');
    console.log(`\n${colors.yellow}Add this to your .env file:${colors.reset}`);
    console.log(`DATABASE_URL="${manualUrl}"\n`);
    return manualUrl;
  } else {
    log(colors.red, '❌ Manual configuration failed');
    
    console.log('\n' + colors.yellow + 'Troubleshooting tips:' + colors.reset);
    console.log('1. Make sure PostgreSQL is running: brew services start postgresql');
    console.log('2. Create the database: createdb breachfeed');
    console.log('3. Check your PostgreSQL user/password settings');
    console.log('4. Try connecting manually: psql -d breachfeed');
    
    return null;
  }
}

// Run the finder
findDatabaseUrl()
  .then((url) => {
    if (url) {
      log(colors.green, '\n🎉 Database URL found successfully!');
      log(colors.blue, 'Next steps:');
      console.log('1. Add the DATABASE_URL to your .env file');
      console.log('2. Run: ./check-environment.js');
      console.log('3. Run: ./deploy-alert-classification.sh');
    } else {
      log(colors.red, '\n❌ Could not find working database configuration');
      log(colors.yellow, 'Please check your PostgreSQL setup and try again');
    }
    rl.close();
  })
  .catch((error) => {
    log(colors.red, `Error: ${error.message}`);
    rl.close();
    process.exit(1);
  });
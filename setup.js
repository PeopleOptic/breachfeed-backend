/**
 * Setup script to populate initial data
 */
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const sampleFeeds = [
  {
    name: 'KrebsOnSecurity',
    url: 'https://krebsonsecurity.com/feed/',
    category: 'Security News'
  },
  {
    name: 'CISA Advisories',
    url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml',
    category: 'Government'
  },
  {
    name: 'SecurityWeek',
    url: 'https://feeds.feedburner.com/securityweek',
    category: 'Security News'
  },
  {
    name: 'Bleeping Computer',
    url: 'https://www.bleepingcomputer.com/feed/',
    category: 'Security News'
  },
  {
    name: 'The Hacker News',
    url: 'https://feeds.feedburner.com/TheHackersNews',
    category: 'Security News'
  }
];

const sampleCompanies = [
  { name: 'Microsoft', aliases: ['Microsoft Corp', 'MSFT', 'MS'], domain: 'microsoft.com' },
  { name: 'Apple', aliases: ['Apple Inc', 'AAPL'], domain: 'apple.com' },
  { name: 'Google', aliases: ['Alphabet', 'GOOGL', 'Google LLC'], domain: 'google.com' },
  { name: 'Amazon', aliases: ['Amazon.com', 'AWS', 'AMZN'], domain: 'amazon.com' },
  { name: 'Meta', aliases: ['Facebook', 'META', 'Meta Platforms'], domain: 'meta.com' },
  { name: 'Tesla', aliases: ['Tesla Inc', 'TSLA'], domain: 'tesla.com' },
  { name: 'Netflix', aliases: ['NFLX'], domain: 'netflix.com' },
  { name: 'Salesforce', aliases: ['CRM', 'Salesforce.com'], domain: 'salesforce.com' },
  { name: 'Adobe', aliases: ['Adobe Inc', 'ADBE'], domain: 'adobe.com' },
  { name: 'Oracle', aliases: ['Oracle Corporation', 'ORCL'], domain: 'oracle.com' }
];

const sampleKeywords = [
  { term: 'data breach', category: 'incident' },
  { term: 'ransomware', category: 'malware' },
  { term: 'phishing', category: 'social engineering' },
  { term: 'malware', category: 'malware' },
  { term: 'vulnerability', category: 'security flaw' },
  { term: 'zero-day', category: 'vulnerability' },
  { term: 'cyber attack', category: 'incident' },
  { term: 'data leak', category: 'incident' },
  { term: 'hacker', category: 'threat actor' },
  { term: 'exploit', category: 'attack method' },
  { term: 'backdoor', category: 'malware' },
  { term: 'trojan', category: 'malware' },
  { term: 'spyware', category: 'malware' },
  { term: 'ddos', category: 'attack method' },
  { term: 'botnet', category: 'infrastructure' },
  { term: 'credential stuffing', category: 'attack method' },
  { term: 'insider threat', category: 'threat actor' },
  { term: 'apt', category: 'threat actor' },
  { term: 'supply chain attack', category: 'attack method' },
  { term: 'privacy violation', category: 'incident' }
];

const sampleAgencies = [
  { name: 'Cybersecurity and Infrastructure Security Agency', acronym: 'CISA', country: 'US', type: 'CYBERSECURITY' },
  { name: 'Federal Bureau of Investigation', acronym: 'FBI', country: 'US', type: 'LAW_ENFORCEMENT' },
  { name: 'National Security Agency', acronym: 'NSA', country: 'US', type: 'CYBERSECURITY' },
  { name: 'Department of Homeland Security', acronym: 'DHS', country: 'US', type: 'GOVERNMENT' },
  { name: 'Securities and Exchange Commission', acronym: 'SEC', country: 'US', type: 'REGULATORY' },
  { name: 'Federal Trade Commission', acronym: 'FTC', country: 'US', type: 'REGULATORY' },
  { name: 'National Institute of Standards and Technology', acronym: 'NIST', country: 'US', type: 'GOVERNMENT' },
  { name: 'European Union Agency for Cybersecurity', acronym: 'ENISA', country: 'EU', type: 'CYBERSECURITY' },
  { name: 'UK National Cyber Security Centre', acronym: 'NCSC', country: 'UK', type: 'CYBERSECURITY' },
  { name: 'Australian Cyber Security Centre', acronym: 'ACSC', country: 'AU', type: 'CYBERSECURITY' }
];

const sampleLocations = [
  { name: 'United States', country: 'US', region: 'North America' },
  { name: 'California', country: 'US', region: 'California' },
  { name: 'New York', country: 'US', region: 'New York' },
  { name: 'Texas', country: 'US', region: 'Texas' },
  { name: 'Florida', country: 'US', region: 'Florida' },
  { name: 'United Kingdom', country: 'UK', region: 'Europe' },
  { name: 'Germany', country: 'DE', region: 'Europe' },
  { name: 'France', country: 'FR', region: 'Europe' },
  { name: 'Canada', country: 'CA', region: 'North America' },
  { name: 'Australia', country: 'AU', region: 'Oceania' },
  { name: 'Japan', country: 'JP', region: 'Asia' },
  { name: 'China', country: 'CN', region: 'Asia' },
  { name: 'India', country: 'IN', region: 'Asia' },
  { name: 'Brazil', country: 'BR', region: 'South America' },
  { name: 'European Union', country: 'EU', region: 'Europe' }
];

async function setup() {
  try {
    console.log('🚀 Setting up BreachFeed initial data...');
    
    // Create RSS feeds
    console.log('📡 Creating RSS feeds...');
    for (const feed of sampleFeeds) {
      await prisma.rssFeed.upsert({
        where: { url: feed.url },
        update: {},
        create: feed
      });
    }
    console.log(`✅ Created ${sampleFeeds.length} RSS feeds`);
    
    // Create companies
    console.log('🏢 Creating companies...');
    for (const company of sampleCompanies) {
      await prisma.company.upsert({
        where: { name: company.name },
        update: {},
        create: company
      });
    }
    console.log(`✅ Created ${sampleCompanies.length} companies`);
    
    // Create keywords
    console.log('🔑 Creating keywords...');
    for (const keyword of sampleKeywords) {
      await prisma.keyword.upsert({
        where: { term: keyword.term },
        update: {},
        create: keyword
      });
    }
    console.log(`✅ Created ${sampleKeywords.length} keywords`);
    
    // Create agencies
    console.log('🏛️ Creating government agencies...');
    for (const agency of sampleAgencies) {
      await prisma.agency.upsert({
        where: { name: agency.name },
        update: {},
        create: agency
      });
    }
    console.log(`✅ Created ${sampleAgencies.length} agencies`);
    
    // Create locations
    console.log('🌍 Creating locations...');
    for (const location of sampleLocations) {
      await prisma.location.upsert({
        where: { name: location.name },
        update: {},
        create: location
      });
    }
    console.log(`✅ Created ${sampleLocations.length} locations`);
    
    console.log('🎉 Setup complete! Your BreachFeed system is ready to go.');
    console.log('');
    console.log('Next steps:');
    console.log('1. Configure your notification services (SendGrid, Twilio)');
    console.log('2. Install the WordPress plugin');
    console.log('3. Start monitoring for breaches!');
    
  } catch (error) {
    console.error('❌ Setup failed:', error);
  } finally {
    await prisma.$disconnect();
  }
}

setup();
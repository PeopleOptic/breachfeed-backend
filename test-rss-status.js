// Simple script to check RSS processing status via API
const axios = require('axios');
require('dotenv').config();

async function checkRSSStatus() {
  const baseURL = `http://localhost:${process.env.PORT || 3000}/api`;
  const apiKey = process.env.API_KEY || process.env.WORDPRESS_API_KEY;
  
  console.log('=== RSS PROCESSING STATUS CHECK ===\n');
  console.log('API Key:', apiKey ? 'Found' : 'NOT FOUND');
  console.log('Base URL:', baseURL);
  
  try {
    // First check if server is running
    const health = await axios.get(`http://localhost:${process.env.PORT || 3000}/health`);
    console.log('\nServer Status:', health.data);
    
    // Get recent articles via API
    const articlesResponse = await axios.get(`${baseURL}/articles`, {
      headers: { 'X-API-Key': apiKey },
      params: { limit: 10 }
    });
    
    const articles = articlesResponse.data;
    console.log(`\nFound ${articles.length} recent articles:\n`);
    
    let withFullContent = 0;
    let withSummary = 0;
    
    articles.forEach((article, index) => {
      console.log(`${index + 1}. ${article.title}`);
      console.log(`   Published: ${article.publishedAt}`);
      console.log(`   Has Full Content: ${article.hasFullContent}`);
      console.log(`   Has Summary: ${!!article.summary}`);
      if (article.summary) {
        console.log(`   Summary Preview: ${article.summary.substring(0, 100)}...`);
      }
      console.log('');
      
      if (article.hasFullContent) withFullContent++;
      if (article.summary) withSummary++;
    });
    
    console.log('\n=== STATISTICS ===');
    console.log(`Articles with full content: ${withFullContent}/${articles.length} (${(withFullContent/articles.length*100).toFixed(1)}%)`);
    console.log(`Articles with AI summary: ${withSummary}/${articles.length} (${(withSummary/articles.length*100).toFixed(1)}%)`);
    
  } catch (error) {
    if (error.code === 'ECONNREFUSED') {
      console.error('\nERROR: Server is not running on port', process.env.PORT || 3000);
      console.error('Please start the server first with: npm start');
    } else {
      console.error('\nERROR:', error.message);
      if (error.response) {
        console.error('Response:', error.response.data);
      }
    }
  }
}

checkRSSStatus();
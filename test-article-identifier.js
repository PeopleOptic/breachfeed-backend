const axios = require('axios');

// Configuration
const API_URL = process.env.API_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'test-api-key-123';

async function testArticleIdentifier() {
  try {
    console.log('Testing article identifier endpoint...\n');
    
    // First, get some articles to test with
    const response = await axios.get(`${API_URL}/api/articles`, {
      headers: { 'x-api-key': API_KEY },
      params: { limit: 1 }
    });
    
    if (response.data.articles.length === 0) {
      console.log('No articles found in the database to test with.');
      return;
    }
    
    const article = response.data.articles[0];
    console.log(`Found article: "${article.title}"`);
    console.log(`ID: ${article.id}`);
    console.log(`Slug: ${article.slug || 'No slug found'}\n`);
    
    // Test 1: Fetch by ID
    console.log('Test 1: Fetching article by ID...');
    try {
      const idResponse = await axios.get(`${API_URL}/api/articles/${article.id}`, {
        headers: { 'x-api-key': API_KEY }
      });
      console.log('✓ Successfully fetched article by ID');
      console.log(`  Title: ${idResponse.data.title}`);
    } catch (error) {
      console.error('✗ Failed to fetch article by ID:', error.response?.data || error.message);
    }
    
    // Test 2: Fetch by slug (if article has one)
    if (article.slug) {
      console.log('\nTest 2: Fetching article by slug...');
      try {
        const slugResponse = await axios.get(`${API_URL}/api/articles/${article.slug}`, {
          headers: { 'x-api-key': API_KEY }
        });
        console.log('✓ Successfully fetched article by slug');
        console.log(`  Title: ${slugResponse.data.title}`);
      } catch (error) {
        console.error('✗ Failed to fetch article by slug:', error.response?.data || error.message);
      }
    } else {
      console.log('\nTest 2: Skipping slug test - article has no slug');
    }
    
    // Test 3: Test with non-existent ID
    console.log('\nTest 3: Testing with non-existent UUID...');
    const fakeUUID = '00000000-0000-0000-0000-000000000000';
    try {
      await axios.get(`${API_URL}/api/articles/${fakeUUID}`, {
        headers: { 'x-api-key': API_KEY }
      });
      console.error('✗ Expected 404 error but request succeeded');
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('✓ Correctly returned 404 for non-existent UUID');
      } else {
        console.error('✗ Unexpected error:', error.response?.data || error.message);
      }
    }
    
    // Test 4: Test with non-existent slug
    console.log('\nTest 4: Testing with non-existent slug...');
    try {
      await axios.get(`${API_URL}/api/articles/this-article-does-not-exist`, {
        headers: { 'x-api-key': API_KEY }
      });
      console.error('✗ Expected 404 error but request succeeded');
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('✓ Correctly returned 404 for non-existent slug');
      } else {
        console.error('✗ Unexpected error:', error.response?.data || error.message);
      }
    }
    
    console.log('\nAll tests completed!');
    
  } catch (error) {
    console.error('Test failed:', error.response?.data || error.message);
  }
}

// Run the test
testArticleIdentifier();
const axios = require('axios');

const API_URL = 'https://breachfeed-backend-production.up.railway.app/api';
const API_KEY = 'sk_prod_6a9f8b2c4d3e5f7a8b9c0d1e2f3a4b5c6d7e8f9a';

async function testKeywordSlug() {
  try {
    console.log('Testing keyword slug endpoint...\n');
    
    // Test the slug endpoint
    const slugResponse = await axios.get(`${API_URL}/keywords/slug/edr`, {
      headers: {
        'X-API-Key': API_KEY
      }
    });
    
    console.log('✅ Slug endpoint response:', JSON.stringify(slugResponse.data, null, 2));
  } catch (error) {
    console.error('❌ Error testing keyword slug:', error.response?.data || error.message);
    
    if (error.response?.status === 404) {
      console.log('\nTrying to fetch all keywords to see available ones...');
      
      try {
        const allKeywords = await axios.get(`${API_URL}/keywords`, {
          headers: {
            'X-API-Key': API_KEY
          }
        });
        
        console.log('\nAvailable keywords:');
        allKeywords.data.forEach(k => {
          console.log(`- ${k.term} (slug: ${k.slug || 'NO SLUG'})`);
        });
      } catch (err) {
        console.error('Failed to fetch keywords:', err.message);
      }
    }
  }
}

testKeywordSlug();
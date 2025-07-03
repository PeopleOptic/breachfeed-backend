require('dotenv').config();
const AIService = require('./src/services/aiService');
const logger = require('./src/utils/logger');

async function testAISummary() {
  console.log('Testing AI Summary Generation\n');
  console.log('============================\n');

  // Test article data
  const testArticle = {
    title: "Cisco discloses root compromise vulnerability in Smart Software Manager On-Prem",
    description: "Cisco has disclosed a critical vulnerability in its Smart Software Manager On-Prem (SSM On-Prem) product that could allow an unauthenticated, remote attacker to gain root access to affected systems.",
    content: "Cisco has released security updates to address a critical vulnerability (CVE-2024-20419) affecting its Smart Software Manager On-Prem (SSM On-Prem) solution. The vulnerability, which has been assigned a CVSS score of 10.0, could allow an unauthenticated, remote attacker to change the password of any user, including administrative users. This flaw exists due to improper implementation of the password-change process, potentially leading to complete system compromise. Cisco strongly recommends that all users of SSM On-Prem versions 8-202206 and earlier immediately upgrade to version 8-202212 or later to mitigate this critical security risk. The company has confirmed that this vulnerability is being actively exploited in the wild.",
    link: "https://example.com/cisco-vulnerability",
    publishedAt: new Date(),
    feedId: 'test-feed'
  };

  console.log('Test Article:', testArticle.title);
  console.log('---\n');

  try {
    // Test 1: Basic incident summary (short content)
    console.log('1. Testing basic incident summary generation...');
    const basicSummary = await AIService.generateIncidentSummary(testArticle);
    console.log('\nResult:');
    console.log('- Alert Type:', basicSummary.alertType);
    console.log('- Severity:', basicSummary.severity);
    console.log('- Incident Type:', basicSummary.incidentType);
    console.log('- AI Generated:', basicSummary.aiGenerated ? 'Yes' : 'No');
    console.log('- Summary:', basicSummary.summary);
    console.log('\n---\n');

    // Test 2: Comprehensive summary (with full content)
    console.log('2. Testing comprehensive summary generation...');
    const fullContent = {
      textContent: testArticle.content + `
        
        Additional details: The vulnerability exists in the password change functionality of SSM On-Prem. 
        An attacker can send specially crafted requests to the web interface to reset any user's password 
        without authentication. This includes the admin account, giving the attacker full control over the 
        system. Cisco has observed active exploitation of this vulnerability in multiple customer environments.
        
        Technical details: The flaw is due to missing authentication checks in the /api/v1/users/password 
        endpoint. The endpoint accepts a user ID and new password without verifying the requester's identity.
        
        Affected versions: All versions of SSM On-Prem 8-202206 and earlier are vulnerable. Version 8-202212 
        includes a fix that properly validates user authentication before allowing password changes.
        
        Indicators of Compromise (IoCs):
        - Unexpected password changes for administrative accounts
        - Unauthorized access logs from external IP addresses
        - New user accounts created without authorization
        - Configuration changes to licensing or software deployment
        
        Cisco's Product Security Incident Response Team (PSIRT) rates this as a critical vulnerability 
        requiring immediate action. Organizations should apply the security update immediately and review 
        access logs for signs of exploitation.`
    };

    const comprehensiveSummary = await AIService.generateComprehensiveSummary(testArticle, fullContent);
    console.log('\nResult:');
    console.log('- Alert Type:', comprehensiveSummary.alertType);
    console.log('- Severity:', comprehensiveSummary.severity);
    console.log('- AI Generated:', comprehensiveSummary.aiGenerated ? 'Yes' : 'No');
    console.log('- Summary:', comprehensiveSummary.summary);
    
    if (comprehensiveSummary.keyFacts && comprehensiveSummary.keyFacts.length > 0) {
      console.log('\nKey Facts:');
      comprehensiveSummary.keyFacts.forEach(fact => console.log('  •', fact));
    }
    
    if (comprehensiveSummary.technicalDetails && comprehensiveSummary.technicalDetails.length > 0) {
      console.log('\nTechnical Details:');
      comprehensiveSummary.technicalDetails.forEach(detail => console.log('  •', detail));
    }
    
    console.log('\nRecommendations:');
    console.log(comprehensiveSummary.recommendations);

    console.log('\n---\n');
    console.log('✅ AI Summary testing complete!');
    
    // Test if AI is actually being used
    if (process.env.ANTHROPIC_API_KEY) {
      console.log('\n🤖 Anthropic AI is configured and should be generating real summaries.');
    } else {
      console.log('\n⚠️  No Anthropic API key found - using template-based summaries.');
    }

  } catch (error) {
    console.error('❌ Error during testing:', error);
  }

  process.exit(0);
}

// Run the test
testAISummary();
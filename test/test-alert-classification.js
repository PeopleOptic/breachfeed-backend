const AIService = require('../src/services/aiService');

/**
 * Test the new alert classification system
 */
async function testAlertClassification() {
  console.log('🧪 Testing Alert Classification System\n');
  
  // Test cases for different alert types
  const testCases = [
    {
      title: "Confirmed Breach Test",
      article: {
        title: "Major Corporation Confirms Data Breach Affecting 2.5 Million Customers",
        description: "The company disclosed that hackers accessed a database containing customer records. The breach was confirmed after a thorough investigation.",
        content: "Following an extensive forensic investigation, MegaCorp officially confirmed that unauthorized individuals accessed their customer database containing 2.5 million records. The company has notified regulatory authorities and is preparing breach notifications.",
        publishedAt: new Date().toISOString()
      },
      expectedType: 'CONFIRMED_BREACH'
    },
    {
      title: "Active Incident Test",
      article: {
        title: "Healthcare System Under Investigation for Potential Security Incident",
        description: "A regional healthcare provider is currently investigating reports of unusual network activity that may indicate a security compromise.",
        content: "Regional Health Network is actively investigating potential unauthorized access to their systems. The incident response team is working to determine the scope of the potential breach. Services remain operational while the investigation continues.",
        publishedAt: new Date().toISOString()
      },
      expectedType: 'INCIDENT'
    },
    {
      title: "Security Mention Test",
      article: {
        title: "New Cybersecurity Framework Released for Financial Institutions",
        description: "Industry experts release comprehensive guidelines for protecting financial data and preventing cyber attacks.",
        content: "The Financial Services Council today announced the release of updated cybersecurity guidelines designed to help institutions protect against emerging threats. The framework includes best practices for data protection and incident response.",
        publishedAt: new Date().toISOString()
      },
      expectedType: 'MENTION'
    },
    {
      title: "Ransomware Confirmed Breach Test",
      article: {
        title: "City Government Systems Encrypted by Ransomware, Investigation Ongoing",
        description: "Municipal services disrupted after ransomware attack encrypts government computers. Officials are working with cybersecurity experts to restore operations.",
        content: "City officials confirmed that ransomware has encrypted critical government systems, disrupting municipal services. The incident response team is currently working to contain the attack and restore normal operations. No ransom payment has been made at this time.",
        publishedAt: new Date().toISOString()
      },
      expectedType: 'CONFIRMED_BREACH'
    },
    {
      title: "Potential Ransomware Incident Test",
      article: {
        title: "School District Investigating Potential Ransomware Attack",
        description: "District officials are investigating reports of unusual network activity that may indicate a ransomware attempt. Systems remain operational while investigation continues.",
        content: "The Metropolitan School District is currently investigating potential ransomware activity after reports of suspicious network behavior. IT teams are working to determine if any systems have been compromised. All educational services remain operational during the investigation.",
        publishedAt: new Date().toISOString()
      },
      expectedType: 'INCIDENT'
    },
    {
      title: "Historical Breach Mention",
      article: {
        title: "Lessons Learned from Major Data Breaches of 2023",
        description: "Security experts analyze the most significant data breaches of the past year and share recommendations for prevention.",
        content: "In a comprehensive report, cybersecurity researchers examined the most impactful data breaches of 2023, including the incidents at TechCorp and DataVault. The analysis provides insights into attack vectors and prevention strategies.",
        publishedAt: new Date().toISOString()
      },
      expectedType: 'MENTION'
    }
  ];
  
  let passedTests = 0;
  
  for (const testCase of testCases) {
    console.log(`📋 ${testCase.title}`);
    console.log(`   Article: "${testCase.article.title}"`);
    
    try {
      const content = `${testCase.article.title} ${testCase.article.description} ${testCase.article.content}`;
      const classification = AIService.classifyAlertType(content, testCase.article);
      
      console.log(`   Classified as: ${classification.alertType} (confidence: ${classification.confidence.toFixed(2)})`);
      console.log(`   Expected: ${testCase.expectedType}`);
      
      if (classification.alertType === testCase.expectedType) {
        console.log(`   ✅ PASSED\n`);
        passedTests++;
      } else {
        console.log(`   ❌ FAILED\n`);
      }
      
      // Test AI insights generation
      const insights = await AIService.generateIncidentSummary(testCase.article);
      console.log(`   Summary: ${insights.summary.substring(0, 100)}...`);
      console.log(`   Alert Type: ${insights.alertType}, Confidence: ${insights.classificationConfidence}\n`);
      
    } catch (error) {
      console.log(`   ❌ ERROR: ${error.message}\n`);
    }
  }
  
  console.log(`🎯 Test Results: ${passedTests}/${testCases.length} tests passed`);
  
  if (passedTests === testCases.length) {
    console.log('🎉 All tests passed! Alert classification system is working correctly.');
  } else {
    console.log('⚠️ Some tests failed. Review the classification logic.');
  }
}

// Run tests
testAlertClassification().catch(console.error);
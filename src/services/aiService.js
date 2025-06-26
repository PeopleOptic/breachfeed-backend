const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * AI Service for generating summaries and recommendations
 * This is a simplified version - in production you'd integrate with OpenAI, Claude, or similar
 */
class AIService {
  
  /**
   * Generate incident summary from article content
   */
  static async generateIncidentSummary(article) {
    try {
      // This is a simplified template-based approach
      // In production, you'd use a proper AI service like OpenAI GPT-4
      
      const content = `${article.title} ${article.description} ${article.content}`.toLowerCase();
      
      // Extract key information
      const incidentType = this.detectIncidentType(content);
      const severity = this.assessSeverity(content);
      const affectedEntities = this.extractAffectedEntities(content);
      
      // Generate summary
      const summary = this.createSummary(article, incidentType, severity, affectedEntities);
      
      // Generate recommendations
      const recommendations = this.generateRecommendations(incidentType, severity);
      
      return {
        summary,
        recommendations,
        incidentType,
        severity,
        affectedEntities
      };
      
    } catch (error) {
      logger.error('Error generating AI summary:', error);
      return {
        summary: `Security incident reported: ${article.title}`,
        recommendations: 'Monitor the situation and review your security posture.',
        incidentType: 'OTHER',
        severity: 'MEDIUM',
        affectedEntities: []
      };
    }
  }
  
  /**
   * Detect incident type from content
   */
  static detectIncidentType(content) {
    const patterns = {
      'DATA_BREACH': ['data breach', 'personal information', 'customer data', 'exposed database', 'leaked data'],
      'RANSOMWARE': ['ransomware', 'encrypted files', 'ransom demand', 'lockbit', 'ryuk', 'conti'],
      'MALWARE': ['malware', 'trojan', 'virus', 'backdoor', 'remote access'],
      'PHISHING': ['phishing', 'fraudulent email', 'credential theft', 'fake website'],
      'VULNERABILITY': ['vulnerability', 'security flaw', 'zero-day', 'exploit', 'patch'],
      'DDOS': ['ddos', 'denial of service', 'traffic flood', 'service disruption'],
      'INSIDER_THREAT': ['insider threat', 'employee', 'privileged access', 'internal'],
      'SUPPLY_CHAIN': ['supply chain', 'third party', 'vendor', 'upstream']
    };
    
    for (const [type, keywords] of Object.entries(patterns)) {
      if (keywords.some(keyword => content.includes(keyword))) {
        return type;
      }
    }
    
    return 'OTHER';
  }
  
  /**
   * Assess severity from content indicators
   */
  static assessSeverity(content) {
    // Critical indicators
    if (content.includes('millions of') || 
        content.includes('critical infrastructure') ||
        content.includes('government') ||
        content.includes('hospital') ||
        content.includes('power grid')) {
      return 'CRITICAL';
    }
    
    // High severity indicators
    if (content.includes('thousands of') ||
        content.includes('financial') ||
        content.includes('healthcare') ||
        content.includes('ransomware') ||
        content.includes('zero-day')) {
      return 'HIGH';
    }
    
    // Low severity indicators
    if (content.includes('minor') ||
        content.includes('limited impact') ||
        content.includes('patched') ||
        content.includes('resolved')) {
      return 'LOW';
    }
    
    return 'MEDIUM';
  }
  
  /**
   * Extract affected entities (simplified)
   */
  static extractAffectedEntities(content) {
    const entities = [];
    
    // Look for common entity patterns
    const patterns = [
      /(\w+\s+(?:inc|corp|corporation|company|ltd|llc))/gi,
      /(\w+\s+(?:hospital|university|college|school))/gi,
      /(\w+\s+(?:bank|financial|insurance))/gi
    ];
    
    patterns.forEach(pattern => {
      const matches = content.match(pattern);
      if (matches) {
        entities.push(...matches.slice(0, 3)); // Limit to 3 per pattern
      }
    });
    
    return [...new Set(entities)].slice(0, 5); // Remove duplicates, limit to 5
  }
  
  /**
   * Create incident summary
   */
  static createSummary(article, incidentType, severity, affectedEntities) {
    const typeDescriptions = {
      'DATA_BREACH': 'A data breach has been reported',
      'RANSOMWARE': 'A ransomware attack has occurred',
      'MALWARE': 'Malware activity has been detected',
      'PHISHING': 'A phishing campaign has been identified',
      'VULNERABILITY': 'A security vulnerability has been disclosed',
      'DDOS': 'A denial of service attack has been reported',
      'INSIDER_THREAT': 'An insider threat incident has occurred',
      'SUPPLY_CHAIN': 'A supply chain security incident has been reported',
      'OTHER': 'A cybersecurity incident has been reported'
    };
    
    let summary = typeDescriptions[incidentType] || typeDescriptions['OTHER'];
    
    if (affectedEntities.length > 0) {
      summary += ` affecting ${affectedEntities.slice(0, 2).join(' and ')}`;
      if (affectedEntities.length > 2) {
        summary += ` and others`;
      }
    }
    
    summary += `. Severity level: ${severity.toLowerCase()}.`;
    
    // Add key details from description
    if (article.description) {
      const keyInfo = this.extractKeyInformation(article.description);
      if (keyInfo) {
        summary += ` ${keyInfo}`;
      }
    }
    
    return summary;
  }
  
  /**
   * Extract key information from description
   */
  static extractKeyInformation(description) {
    // Look for numbers, dates, and key facts
    const patterns = [
      /(\d+(?:,\d{3})*)\s+(?:records|users|customers|accounts)/i,
      /(?:discovered|reported|occurred)\s+(?:on|in)\s+([^.]+)/i,
      /(compromised|exposed|stolen|leaked)\s+([^.]+)/i
    ];
    
    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match) {
        return match[0];
      }
    }
    
    return null;
  }
  
  /**
   * Generate remediation recommendations
   */
  static generateRecommendations(incidentType, severity) {
    const baseRecommendations = {
      'DATA_BREACH': [
        'Review access controls and user permissions',
        'Implement data encryption at rest and in transit',
        'Conduct security awareness training',
        'Monitor for unauthorized access attempts',
        'Review data retention and disposal policies'
      ],
      'RANSOMWARE': [
        'Ensure robust backup and recovery procedures',
        'Implement network segmentation',
        'Deploy endpoint detection and response (EDR)',
        'Keep systems and software updated',
        'Train employees on phishing recognition'
      ],
      'MALWARE': [
        'Update antivirus and anti-malware definitions',
        'Scan all systems for signs of infection',
        'Review and update security policies',
        'Implement application whitelisting',
        'Monitor network traffic for anomalies'
      ],
      'PHISHING': [
        'Implement email security filters',
        'Conduct phishing simulation training',
        'Enable multi-factor authentication',
        'Review and update email policies',
        'Monitor for credential compromise'
      ],
      'VULNERABILITY': [
        'Apply security patches immediately',
        'Conduct vulnerability assessments',
        'Review system configurations',
        'Implement vulnerability management program',
        'Monitor vendor security advisories'
      ],
      'DDOS': [
        'Review DDoS protection measures',
        'Implement traffic filtering',
        'Prepare incident response procedures',
        'Consider cloud-based DDoS protection',
        'Monitor network capacity and performance'
      ],
      'INSIDER_THREAT': [
        'Review privileged access management',
        'Implement user activity monitoring',
        'Conduct background checks',
        'Establish clear security policies',
        'Implement separation of duties'
      ],
      'SUPPLY_CHAIN': [
        'Review third-party security assessments',
        'Implement vendor risk management',
        'Monitor supply chain security',
        'Establish incident response coordination',
        'Review contractual security requirements'
      ]
    };
    
    let recommendations = baseRecommendations[incidentType] || [
      'Review current security posture',
      'Monitor for similar threats',
      'Update security policies as needed',
      'Conduct security awareness training',
      'Consider engaging security professionals'
    ];
    
    // Add severity-specific recommendations
    if (severity === 'CRITICAL' || severity === 'HIGH') {
      recommendations.unshift(
        'Consider engaging external cybersecurity experts',
        'Activate incident response team immediately'
      );
    }
    
    return recommendations.slice(0, 5).map((rec, index) => `${index + 1}. ${rec}`).join('\n');
  }
  
  /**
   * Extract image URL from article content
   */
  static extractImageUrl(article) {
    if (!article.content) return null;
    
    // Look for images in content
    const imageRegex = /<img[^>]+src="([^">]+)"/i;
    const match = article.content.match(imageRegex);
    
    if (match && match[1]) {
      return match[1];
    }
    
    // Look for OpenGraph images in content
    const ogImageRegex = /<meta[^>]+property="og:image"[^>]+content="([^">]+)"/i;
    const ogMatch = article.content.match(ogImageRegex);
    
    if (ogMatch && ogMatch[1]) {
      return ogMatch[1];
    }
    
    return null;
  }
}

module.exports = AIService;
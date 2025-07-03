const { PrismaClient } = require('@prisma/client');
const logger = require('../utils/logger');

const prisma = new PrismaClient();

/**
 * AI Service for generating summaries and recommendations
 * This is a simplified version - in production you'd integrate with OpenAI, Claude, or similar
 */
class AIService {
  
  /**
   * Generate comprehensive summary from full article content
   * This method is specifically for when we have the full article text
   */
  static async generateComprehensiveSummary(article, fullContent) {
    try {
      logger.info(`Generating comprehensive summary for article: ${article.title}`);
      
      // Use full content if available, otherwise fall back to RSS content
      const contentToAnalyze = fullContent?.textContent || `${article.title} ${article.description} ${article.content}`;
      
      // If we have substantial full content, create a more detailed summary
      if (fullContent?.textContent && fullContent.textContent.length > 1000) {
        return this.createEnhancedSummary(article, fullContent, contentToAnalyze);
      }
      
      // Fall back to regular summary generation
      return this.generateIncidentSummary(article);
      
    } catch (error) {
      logger.error('Error generating comprehensive summary:', error);
      return this.generateIncidentSummary(article); // Fallback
    }
  }
  
  /**
   * Create enhanced summary from full article content
   */
  static createEnhancedSummary(article, fullContent, contentText) {
    const content = contentText.toLowerCase();
    
    // Extract more detailed information from full content
    const alertClassification = this.classifyAlertType(content, article);
    const incidentType = this.detectIncidentType(content);
    const severity = this.assessSeverity(content);
    const affectedEntities = this.extractAffectedEntities(content);
    
    // Extract key facts from the full article
    const keyFacts = this.extractKeyFacts(contentText);
    const timeline = this.extractTimeline(contentText);
    const impact = this.extractImpact(contentText);
    const technicalDetails = this.extractTechnicalDetails(contentText);
    
    // Create comprehensive summary
    let summary = '';
    
    // Alert header
    const alertPrefixes = {
      'CONFIRMED_BREACH': '🚨 CONFIRMED BREACH: ',
      'SECURITY_INCIDENT': '⚠️ ACTIVE INCIDENT: ',
      'SECURITY_MENTION': 'ℹ️ SECURITY UPDATE: '
    };
    summary += alertPrefixes[alertClassification.alertType] || '';
    
    // Main incident description
    summary += `${article.title}\n\n`;
    
    // Key facts section
    if (keyFacts.length > 0) {
      summary += 'KEY FACTS:\n';
      keyFacts.forEach(fact => {
        summary += `• ${fact}\n`;
      });
      summary += '\n';
    }
    
    // Timeline if available
    if (timeline.length > 0) {
      summary += 'TIMELINE:\n';
      timeline.forEach(event => {
        summary += `• ${event}\n`;
      });
      summary += '\n';
    }
    
    // Impact assessment
    if (impact.length > 0) {
      summary += 'IMPACT:\n';
      impact.forEach(item => {
        summary += `• ${item}\n`;
      });
      summary += '\n';
    }
    
    // Technical details for high severity incidents
    if (severity === 'CRITICAL' || severity === 'HIGH') {
      if (technicalDetails.length > 0) {
        summary += 'TECHNICAL DETAILS:\n';
        technicalDetails.forEach(detail => {
          summary += `• ${detail}\n`;
        });
      }
    }
    
    // Generate enhanced recommendations
    const recommendations = this.generateEnhancedRecommendations(
      incidentType, 
      severity, 
      alertClassification.alertType,
      keyFacts,
      technicalDetails
    );
    
    return {
      summary: summary.trim(),
      recommendations,
      incidentType,
      severity,
      affectedEntities,
      alertType: alertClassification.alertType,
      classificationConfidence: alertClassification.confidence,
      keyFacts,
      timeline,
      impact,
      technicalDetails,
      contentLength: contentText.length,
      isComprehensive: true
    };
  }
  
  /**
   * Extract key facts from article content
   */
  static extractKeyFacts(content) {
    const facts = [];
    const lines = content.split(/[.\n]/);
    
    // Patterns that indicate key facts
    const factPatterns = [
      /(\d+)\s*(million|thousand|hundred)\s*(users?|customers?|accounts?|records?)/i,
      /affected\s*(.*?)(?:were|was|have been)/i,
      /compromised\s*(.*?)(?:were|was|have been)/i,
      /stolen\s*(.*?)(?:were|was|have been)/i,
      /exposed\s*(.*?)(?:were|was|have been)/i,
      /vulnerability\s*(?:in|affecting)\s*(.*?)(?:allows|could|can)/i,
      /attack(?:ers?)?\s*(?:used|exploited|leveraged)\s*(.*?)to/i,
      /(?:cost|damage|loss).*?\$[\d,]+/i,
      /(?:since|from|between).*?(?:january|february|march|april|may|june|july|august|september|october|november|december|\d{4})/i
    ];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      if (trimmed.length > 20 && trimmed.length < 200) {
        for (const pattern of factPatterns) {
          if (pattern.test(trimmed)) {
            facts.push(trimmed);
            break;
          }
        }
      }
    });
    
    // Remove duplicates and limit to top 5 facts
    return [...new Set(facts)].slice(0, 5);
  }
  
  /**
   * Extract timeline information
   */
  static extractTimeline(content) {
    const timeline = [];
    const lines = content.split(/[.\n]/);
    
    // Patterns for timeline events
    const timePatterns = [
      /(?:on|at)\s*(?:january|february|march|april|may|june|july|august|september|october|november|december)\s*\d{1,2}/i,
      /(?:on|at)\s*\d{1,2}\/\d{1,2}\/\d{2,4}/,
      /(?:yesterday|today|last\s*week|last\s*month)/i,
      /\d{1,2}:\d{2}\s*(?:am|pm|utc|est|pst)/i,
      /(?:first|initially|subsequently|then|after|finally)/i
    ];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      for (const pattern of timePatterns) {
        if (pattern.test(trimmed) && trimmed.length < 150) {
          timeline.push(trimmed);
          break;
        }
      }
    });
    
    return timeline.slice(0, 4);
  }
  
  /**
   * Extract impact information
   */
  static extractImpact(content) {
    const impacts = [];
    const lines = content.split(/[.\n]/);
    
    // Impact indicators
    const impactPatterns = [
      /(?:resulted in|led to|caused)\s*(.*)/i,
      /(?:impact|affect|disrupted)\s*(.*)/i,
      /(?:down|offline|unavailable)\s*(?:for|since)\s*(.*)/i,
      /(?:lost|stolen|compromised)\s*(?:data|information|credentials)/i,
      /(?:financial|economic)\s*(?:loss|damage|impact)/i,
      /(?:reputation|trust|confidence)\s*(?:damage|loss|impact)/i
    ];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      for (const pattern of impactPatterns) {
        if (pattern.test(trimmed) && trimmed.length < 150) {
          impacts.push(trimmed);
          break;
        }
      }
    });
    
    return [...new Set(impacts)].slice(0, 3);
  }
  
  /**
   * Extract technical details
   */
  static extractTechnicalDetails(content) {
    const details = [];
    const lines = content.split(/[.\n]/);
    
    // Technical indicators
    const techPatterns = [
      /CVE-\d{4}-\d+/i,
      /(?:exploit|vulnerability|flaw)\s*(?:in|affecting)\s*(.*?)(?:allows|could)/i,
      /(?:malware|trojan|virus|ransomware)\s*(?:named|called|known as)\s*(.*?)(?:was|has)/i,
      /(?:port|protocol|service)\s*\d+/i,
      /(?:version|versions?)\s*(?:\d+\.?)+/i,
      /(?:patch|update|fix)\s*(?:available|released)/i,
      /(?:authentication|authorization|encryption)/i,
      /(?:sql injection|xss|csrf|rce|lfi)/i
    ];
    
    lines.forEach(line => {
      const trimmed = line.trim();
      for (const pattern of techPatterns) {
        if (pattern.test(trimmed) && trimmed.length < 200) {
          details.push(trimmed);
          break;
        }
      }
    });
    
    return [...new Set(details)].slice(0, 4);
  }
  
  /**
   * Generate enhanced recommendations based on comprehensive analysis
   */
  static generateEnhancedRecommendations(incidentType, severity, alertType, keyFacts, technicalDetails) {
    let recommendations = [];
    
    // Base recommendations from regular method
    const baseRecs = this.generateRecommendations(incidentType, severity, alertType);
    recommendations.push(baseRecs);
    
    // Add specific recommendations based on technical details
    if (technicalDetails.some(detail => /cve-\d{4}-\d+/i.test(detail))) {
      recommendations.push('\n🔧 PATCHING PRIORITY:\n• Check if this CVE affects your systems\n• Apply vendor patches immediately if available\n• Implement compensating controls if patches are not yet available');
    }
    
    if (technicalDetails.some(detail => /(?:port|service)\s*\d+/i.test(detail))) {
      recommendations.push('\n🔒 NETWORK SECURITY:\n• Review firewall rules for mentioned ports/services\n• Ensure unnecessary services are disabled\n• Monitor network traffic for suspicious activity');
    }
    
    if (keyFacts.some(fact => /(?:million|thousand)\s*(?:users?|customers?|accounts?)/i.test(fact))) {
      recommendations.push('\n👥 CUSTOMER COMMUNICATION:\n• Prepare customer notification if your users might be affected\n• Review and update privacy incident response procedures\n• Consider offering identity protection services if applicable');
    }
    
    // Severity-based urgent actions
    if (severity === 'CRITICAL' && alertType === 'CONFIRMED_BREACH') {
      recommendations.push('\n🚨 IMMEDIATE ACTIONS REQUIRED:\n• Activate incident response team immediately\n• Isolate affected systems\n• Preserve evidence for forensics\n• Notify legal and compliance teams\n• Begin breach notification timeline tracking');
    }
    
    return recommendations.join('\n\n');
  }
  
  /**
   * Generate incident summary from article content
   */
  static async generateIncidentSummary(article) {
    try {
      // This is a simplified template-based approach
      // In production, you'd use a proper AI service like OpenAI GPT-4
      
      const content = `${article.title} ${article.description} ${article.content}`.toLowerCase();
      
      // Classify alert type first
      const alertClassification = this.classifyAlertType(content, article);
      
      // Extract key information
      const incidentType = this.detectIncidentType(content);
      const severity = this.assessSeverity(content);
      const affectedEntities = this.extractAffectedEntities(content);
      
      // Generate summary based on alert type
      const summary = this.createSummary(article, incidentType, severity, affectedEntities, alertClassification.alertType);
      
      // Generate recommendations based on alert type and severity
      const recommendations = this.generateRecommendations(incidentType, severity, alertClassification.alertType);
      
      return {
        summary,
        recommendations,
        incidentType,
        severity,
        affectedEntities,
        alertType: alertClassification.alertType,
        classificationConfidence: alertClassification.confidence
      };
      
    } catch (error) {
      logger.error('Error generating AI summary:', error);
      return {
        summary: `Security incident reported: ${article.title}`,
        recommendations: 'Monitor the situation and review your security posture.',
        incidentType: 'OTHER',
        severity: 'MEDIUM',
        affectedEntities: [],
        alertType: 'MENTION',
        classificationConfidence: 0.3
      };
    }
  }
  
  /**
   * Classify alert type: CONFIRMED_BREACH, INCIDENT, or MENTION
   */
  static classifyAlertType(content, article) {
    try {
      const lowerContent = content.toLowerCase();
      
      // Check for Confirmed Breach indicators
      if (this.isConfirmedBreach(lowerContent, article)) {
        return {
          alertType: 'CONFIRMED_BREACH',
          confidence: this.calculateBreachConfidence(lowerContent)
        };
      }
      
      // Check for Active Incident indicators
      if (this.isActiveIncident(lowerContent, article)) {
        return {
          alertType: 'SECURITY_INCIDENT',
          confidence: this.calculateIncidentConfidence(lowerContent)
        };
      }
      
      // Default to Mention
      return {
        alertType: 'SECURITY_MENTION',
        confidence: 0.5
      };
    } catch (error) {
      logger.error('Error classifying alert type:', error);
      return {
        alertType: 'SECURITY_MENTION',
        confidence: 0.3
      };
    }
  }
  
  /**
   * Check if content indicates a confirmed breach
   */
  static isConfirmedBreach(content, article) {
    // First check for uncertainty words that would disqualify as confirmed breach
    const uncertaintyWords = /(potential|possible|suspected|alleged|investigating|may have|might have|could have|reports of)/i;
    
    const confirmedBreachPatterns = [
      // Explicit confirmation language
      /confirmed.{0,20}(data.?)?breach/i,
      /breach.{0,20}(has been |was )?confirmed/i,
      /(disclosed|announced|revealed|admitted).{0,30}(data.?)?breach/i,
      /official.{0,20}(statement|announcement).{0,50}breach/i,
      
      // Specific breach indicators with numbers
      /(\d+(?:,\d{3})*|\d+\.?\d*\s*(?:million|billion|thousand|k|m))\s+(?:records?|customers?|users?|accounts?).{0,50}(exposed|stolen|leaked|compromised|affected|breached)/i,
      /(exposed|stolen|leaked|compromised).{0,50}(\d+(?:,\d{3})*|\d+\.?\d*\s*(?:million|billion|thousand|k|m))\s+(?:records?|customers?|users?|accounts?)/i,
      
      // Past tense breach language
      /(was|were|have been|has been).{0,20}(breached|compromised|hacked)/i,
      /breach.{0,20}(occurred|happened|took place)/i,
      
      // Regulatory or legal language
      /(sec filing|regulatory disclosure|breach notification|notified.{0,20}authorities)/i,
      /(class.?action|lawsuit|legal action).{0,50}data.?breach/i,
      
      // Confirmed successful attacks (damage done)
      /ransomware.{0,50}(encrypted|locked|compromised)/i,
      /(encrypted|locked).{0,50}(by.{0,20})?ransomware/i,
      /(systems?|files?).{0,20}(encrypted|locked).{0,50}(ransomware|attack)/i,
      
      // Ransomware with payment confirmation or successful encryption
      /ransom.{0,50}(paid|payment|demanded)/i,
      /(paid|paying).{0,30}ransom/i,
      
      // Other confirmed successful attacks
      /(successfully|managed to).{0,30}(breach|compromise|access|steal)/i,
      /(gained access|stole|accessed).{0,30}(to.{0,20})?(database|systems?|files?|data)/i
    ];
    
    const hasConfirmedPattern = confirmedBreachPatterns.some(pattern => pattern.test(content));
    
    // If we find confirmed breach patterns but also uncertainty language, 
    // check if the uncertainty is about the same thing
    if (hasConfirmedPattern && uncertaintyWords.test(content)) {
      // Special case: if systems are confirmed encrypted but investigation is ongoing, still confirmed
      if (/(systems?|files?).{0,20}(encrypted|locked)/i.test(content)) {
        return true;
      }
      // Otherwise, uncertainty reduces confidence to incident level
      return false;
    }
    
    return hasConfirmedPattern;
  }
  
  /**
   * Check if content indicates an active incident
   */
  static isActiveIncident(content, article) {
    // First check if it's already classified as a confirmed breach
    if (this.isConfirmedBreach(content, article)) {
      return false; // Don't double-classify
    }
    
    const activeIncidentPatterns = [
      // Investigation language (but not confirmed)
      /(investigating|investigation into|looking into|probing).{0,30}(potential|possible|suspected)?.{0,20}(breach|incident|attack|compromise)/i,
      /(potential|possible|suspected|alleged).{0,20}(breach|security incident|cyberattack|data leak)/i,
      
      // Ongoing attack language (but not completed/confirmed)
      /(currently|actively|ongoing).{0,20}(under attack|experiencing|investigating|responding)/i,
      /(experiencing|facing|under|suffering).{0,20}(cyberattack|security incident|ddos)/i,
      
      // Response and mitigation language (active response implies ongoing situation)
      /(responding to|addressing|mitigating|containing).{0,30}(security|cyber)?.{0,20}(incident|attack)/i,
      /(security team|incident response|ir team).{0,30}(investigating|responding|working)/i,
      
      // Service disruption (but not confirmed data loss)
      /(services?|systems?|operations?).{0,20}(disrupted|affected|impacted|down|offline).{0,50}(due to|following|after).{0,20}(security|cyber)/i,
      
      // Unconfirmed but serious (uncertainty words indicate investigation phase)
      /(may have|might have|could have).{0,20}(been )?(breached|compromised|affected)/i,
      /reports?.{0,20}(of|suggest|indicate).{0,30}(breach|compromise|incident)/i,
      
      // Active containment without confirmation
      /(working to|attempting to|trying to).{0,30}(contain|stop|prevent|mitigate)/i
    ];
    
    // Exception: If ransomware has already encrypted systems, that's confirmed damage
    if (/ransomware.{0,50}(encrypted|locked|affected)/i.test(content) || 
        /(encrypted|locked).{0,50}ransomware/i.test(content)) {
      return false; // This would be classified as confirmed breach
    }
    
    // Also check publication date - recent articles about ongoing situations
    const articleDate = new Date(article.publishedAt);
    const daysSincePublished = (Date.now() - articleDate.getTime()) / (1000 * 60 * 60 * 24);
    const isRecent = daysSincePublished < 7;
    
    const hasIncidentPattern = activeIncidentPatterns.some(pattern => pattern.test(content));
    
    // If it has incident patterns and is recent, it's more likely an active incident
    // Also require some uncertainty language to distinguish from confirmed breaches
    const hasUncertainty = /(investigating|potential|possible|suspected|may|might|could|reports of)/i.test(content);
    
    return hasIncidentPattern && (isRecent || content.includes('ongoing') || content.includes('currently')) && hasUncertainty;
  }
  
  /**
   * Calculate confidence score for breach classification
   */
  static calculateBreachConfidence(content) {
    let confidence = 0.7; // Base confidence for confirmed breach
    
    // Increase confidence for multiple indicators
    const indicators = [
      /confirmed.{0,20}breach/i,
      /(\d+(?:,\d{3})*|\d+\.?\d*\s*(?:million|billion))/i,
      /(disclosed|announced|revealed)/i,
      /official.{0,20}statement/i,
      /(sec filing|regulatory|authorities notified)/i
    ];
    
    const matchCount = indicators.filter(pattern => pattern.test(content)).length;
    confidence += (matchCount * 0.05);
    
    // Cap at 1.0
    return Math.min(confidence, 1.0);
  }
  
  /**
   * Calculate confidence score for incident classification
   */
  static calculateIncidentConfidence(content) {
    let confidence = 0.6; // Base confidence for incident
    
    // Increase confidence for multiple indicators
    const indicators = [
      /investigating/i,
      /(potential|possible|suspected)/i,
      /currently.{0,20}(under|experiencing)/i,
      /incident response/i,
      /services?.{0,20}(disrupted|down)/i
    ];
    
    const matchCount = indicators.filter(pattern => pattern.test(content)).length;
    confidence += (matchCount * 0.05);
    
    // Decrease confidence if there are uncertainty words
    if (/may have|might have|could have|allegedly/i.test(content)) {
      confidence -= 0.1;
    }
    
    return Math.max(0.3, Math.min(confidence, 0.9));
  }

  /**
   * Detect incident type from content (enhanced)
   */
  static detectIncidentType(content) {
    const patterns = {
      'DATA_BREACH': ['data breach', 'personal information', 'customer data', 'exposed database', 'leaked data', 'records exposed', 'information stolen'],
      'RANSOMWARE': ['ransomware', 'encrypted files', 'ransom demand', 'lockbit', 'ryuk', 'conti', 'ransom payment'],
      'MALWARE': ['malware', 'trojan', 'virus', 'backdoor', 'remote access', 'infected systems'],
      'PHISHING': ['phishing', 'fraudulent email', 'credential theft', 'fake website', 'spear phishing'],
      'VULNERABILITY': ['vulnerability', 'security flaw', 'zero-day', 'exploit', 'patch', 'cve-', 'hardcoded', 'root credentials', 'root access', 'authentication bypass', 'privilege escalation'],
      'DDOS': ['ddos', 'denial of service', 'traffic flood', 'service disruption', 'distributed denial'],
      'INSIDER_THREAT': ['insider threat', 'employee', 'privileged access', 'internal', 'rogue employee'],
      'SUPPLY_CHAIN': ['supply chain', 'third party', 'vendor', 'upstream', 'supplier compromise']
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
        content.includes('power grid') ||
        content.includes('max severity') ||
        content.includes('max-severity') ||
        content.includes('cvss 10') ||
        content.includes('root credentials') ||
        content.includes('root access')) {
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
  static createSummary(article, incidentType, severity, affectedEntities, alertType) {
    const alertPrefixes = {
      'CONFIRMED_BREACH': '🚨 CONFIRMED BREACH: ',
      'SECURITY_INCIDENT': '⚠️ ACTIVE INCIDENT: ',
      'SECURITY_MENTION': 'ℹ️ SECURITY UPDATE: '
    };
    
    const typeDescriptions = {
      'DATA_BREACH': {
        'CONFIRMED_BREACH': 'A confirmed data breach has exposed sensitive information',
        'SECURITY_INCIDENT': 'A potential data breach is being investigated',
        'SECURITY_MENTION': 'Data breach activity has been mentioned'
      },
      'RANSOMWARE': {
        'CONFIRMED_BREACH': 'A ransomware attack has successfully encrypted systems',
        'SECURITY_INCIDENT': 'An active ransomware attack is in progress',
        'SECURITY_MENTION': 'Ransomware activity has been reported'
      },
      'MALWARE': {
        'CONFIRMED_BREACH': 'Malware has compromised systems',
        'SECURITY_INCIDENT': 'Malware activity is currently being addressed',
        'SECURITY_MENTION': 'Malware has been mentioned in security context'
      },
      'PHISHING': {
        'CONFIRMED_BREACH': 'A phishing campaign has successfully compromised accounts',
        'SECURITY_INCIDENT': 'An active phishing campaign is targeting users',
        'SECURITY_MENTION': 'Phishing activity has been identified'
      },
      'VULNERABILITY': {
        'CONFIRMED_BREACH': 'A vulnerability has been actively exploited',
        'SECURITY_INCIDENT': 'A critical vulnerability is being assessed',
        'SECURITY_MENTION': 'A security vulnerability has been disclosed'
      },
      'DDOS': {
        'CONFIRMED_BREACH': 'Services have been taken offline by a DDoS attack',
        'SECURITY_INCIDENT': 'An ongoing DDoS attack is affecting services',
        'SECURITY_MENTION': 'DDoS activity has been reported'
      },
      'INSIDER_THREAT': {
        'CONFIRMED_BREACH': 'An insider has compromised sensitive data',
        'SECURITY_INCIDENT': 'Potential insider threat activity is being investigated',
        'SECURITY_MENTION': 'Insider threat concerns have been raised'
      },
      'SUPPLY_CHAIN': {
        'CONFIRMED_BREACH': 'A supply chain attack has compromised systems',
        'SECURITY_INCIDENT': 'Supply chain security incident is being investigated',
        'SECURITY_MENTION': 'Supply chain security has been mentioned'
      },
      'OTHER': {
        'CONFIRMED_BREACH': 'A confirmed security breach has occurred',
        'SECURITY_INCIDENT': 'A security incident is being investigated',
        'SECURITY_MENTION': 'Security-related activity has been reported'
      }
    };
    
    // Get appropriate description based on incident and alert type
    const descriptions = typeDescriptions[incidentType] || typeDescriptions['OTHER'];
    let summary = alertPrefixes[alertType] + (descriptions[alertType] || descriptions['SECURITY_MENTION']);
    
    if (affectedEntities.length > 0) {
      summary += ` affecting ${affectedEntities.slice(0, 2).join(' and ')}`;
      if (affectedEntities.length > 2) {
        summary += ` and others`;
      }
    }
    
    summary += `. Severity level: ${severity.toLowerCase()}.`;
    
    // Add key details from description and content
    const fullText = `${article.description || ''} ${article.content || ''}`;
    const keyInfo = this.extractKeyInformation(fullText);
    if (keyInfo) {
      summary += ` ${keyInfo}`;
    }
    
    // Add CVE if present
    const cveMatch = fullText.match(/CVE-\d{4}-\d+/i);
    if (cveMatch && !summary.includes(cveMatch[0])) {
      summary += ` (${cveMatch[0]})`;
    }
    
    return summary;
  }
  
  /**
   * Extract key information from description
   */
  static extractKeyInformation(text) {
    // Look for numbers, dates, and key facts
    const patterns = [
      /(\d+(?:,\d{3})*)\s+(?:records|users|customers|accounts|devices|systems)/i,
      /(?:discovered|reported|occurred|found)\s+(?:on|in)\s+([^.]+)/i,
      /(compromised|exposed|stolen|leaked|hardcoded|vulnerable)\s+([^.]+)/i,
      /(root|admin|password|credential|login)\s+(?:access|credentials?)\s+([^.]+)/i,
      /affects?\s+([^.]+(?:version|release|build)[^.]+)/i,
      /CVSS\s*(?:score|rating)?\s*(?:of|:)?\s*([\d.]+)/i
    ];
    
    const keyFacts = [];
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[0].length < 150) {
        keyFacts.push(match[0].trim());
      }
    }
    
    return keyFacts.slice(0, 2).join('. ') || null;
  }
  
  /**
   * Generate remediation recommendations
   */
  static generateRecommendations(incidentType, severity, alertType) {
    // Alert type specific prefix recommendations
    const alertTypeRecommendations = {
      'CONFIRMED_BREACH': [
        '🚨 IMMEDIATE ACTION REQUIRED:',
        '1. Activate incident response team immediately',
        '2. Contain the breach and preserve evidence',
        '3. Notify legal counsel and regulatory authorities as required',
        '4. Begin forensic investigation to determine scope',
        '5. Prepare breach notification communications'
      ],
      'INCIDENT': [
        '⚠️ URGENT INVESTIGATION NEEDED:',
        '1. Initiate incident response procedures',
        '2. Gather and preserve potential evidence',
        '3. Monitor systems for suspicious activity',
        '4. Review logs and access patterns',
        '5. Prepare containment strategies'
      ],
      'MENTION': [
        'ℹ️ PROACTIVE MEASURES RECOMMENDED:',
        '1. Review your security posture',
        '2. Ensure patches are up to date',
        '3. Monitor for related threats',
        '4. Review security awareness training',
        '5. Update threat intelligence feeds'
      ]
    };
    
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
    
    // Combine alert type specific recommendations with base recommendations
    const alertPrefix = alertTypeRecommendations[alertType] || alertTypeRecommendations['MENTION'];
    const combinedRecommendations = [
      alertPrefix[0], // Header
      ...alertPrefix.slice(1, 6), // Top 5 alert-specific recommendations
      '\nAdditional recommendations based on incident type:',
      ...recommendations.slice(0, 3).map((rec, index) => `${index + 1}. ${rec}`)
    ];
    
    return combinedRecommendations.join('\n');
  }
  
  /**
   * Generate smart tags from article content
   */
  static generateTags(article) {
    try {
      const content = `${article.title} ${article.description} ${article.content || ''}`.toLowerCase();
      const tags = new Set();
      
      // Technology/Platform tags
      const techPatterns = {
        'windows': ['windows', 'microsoft windows', 'win10', 'win11'],
        'linux': ['linux', 'ubuntu', 'debian', 'centos', 'redhat'],
        'macos': ['macos', 'mac os', 'osx', 'apple'],
        'android': ['android', 'google android'],
        'ios': ['ios', 'iphone', 'ipad', 'apple ios'],
        'cloud': ['cloud', 'aws', 'azure', 'gcp', 'google cloud'],
        'docker': ['docker', 'container', 'kubernetes'],
        'wordpress': ['wordpress', 'wp'],
        'apache': ['apache', 'httpd'],
        'nginx': ['nginx'],
        'mysql': ['mysql', 'mariadb'],
        'postgresql': ['postgresql', 'postgres'],
        'mongodb': ['mongodb', 'mongo'],
        'redis': ['redis'],
        'elasticsearch': ['elasticsearch', 'elastic'],
        'jenkins': ['jenkins'],
        'git': ['git', 'github', 'gitlab'],
        'ssh': ['ssh', 'secure shell'],
        'ftp': ['ftp', 'sftp'],
        'vpn': ['vpn', 'virtual private network'],
        'firewall': ['firewall', 'iptables'],
        'java': ['java', 'jvm'],
        'python': ['python'],
        'javascript': ['javascript', 'js', 'node.js', 'nodejs'],
        'php': ['php'],
        'dotnet': ['.net', 'dotnet', 'c#']
      };
      
      // Attack/Threat type tags
      const attackPatterns = {
        'ransomware': ['ransomware', 'encryption', 'ransom'],
        'phishing': ['phishing', 'spear-phishing', 'credential-harvesting'],
        'malware': ['malware', 'trojan', 'virus', 'worm', 'backdoor'],
        'apt': ['apt', 'advanced persistent threat', 'nation-state'],
        'ddos': ['ddos', 'denial of service', 'botnet'],
        'sql-injection': ['sql injection', 'sqli'],
        'xss': ['xss', 'cross-site scripting'],
        'csrf': ['csrf', 'cross-site request forgery'],
        'rce': ['remote code execution', 'rce'],
        'privilege-escalation': ['privilege escalation', 'privesc'],
        'zero-day': ['zero-day', 'zero day', '0-day'],
        'supply-chain': ['supply chain', 'third-party'],
        'insider-threat': ['insider threat', 'rogue employee'],
        'social-engineering': ['social engineering', 'pretexting'],
        'cryptojacking': ['cryptojacking', 'cryptocurrency mining'],
        'business-email-compromise': ['bec', 'business email compromise']
      };
      
      // Industry/Sector tags
      const industryPatterns = {
        'healthcare': ['healthcare', 'hospital', 'medical', 'health'],
        'finance': ['bank', 'financial', 'fintech', 'payment'],
        'government': ['government', 'federal', 'state', 'municipal'],
        'education': ['university', 'college', 'school', 'education'],
        'retail': ['retail', 'e-commerce', 'shopping'],
        'manufacturing': ['manufacturing', 'industrial', 'factory'],
        'energy': ['energy', 'power', 'utility', 'grid'],
        'telecommunications': ['telecom', 'telecommunications', 'network'],
        'transportation': ['transportation', 'airline', 'shipping'],
        'media': ['media', 'news', 'broadcasting'],
        'technology': ['tech company', 'software company', 'it services']
      };
      
      // Compliance/Framework tags
      const compliancePatterns = {
        'gdpr': ['gdpr', 'general data protection regulation'],
        'hipaa': ['hipaa', 'health insurance portability'],
        'pci-dss': ['pci-dss', 'payment card industry'],
        'sox': ['sarbanes-oxley', 'sox'],
        'iso27001': ['iso 27001', 'iso27001'],
        'nist': ['nist', 'cybersecurity framework'],
        'cis': ['cis controls', 'center for internet security']
      };
      
      // Geographic tags
      const geoPatterns = {
        'usa': ['united states', 'usa', 'us', 'america'],
        'europe': ['europe', 'eu', 'european union'],
        'uk': ['united kingdom', 'uk', 'britain'],
        'china': ['china', 'chinese'],
        'russia': ['russia', 'russian'],
        'north-korea': ['north korea', 'dprk'],
        'iran': ['iran', 'iranian'],
        'global': ['global', 'worldwide', 'international']
      };
      
      // CVE pattern
      const cvePattern = /cve-\d{4}-\d{4,}/gi;
      const cveMatches = content.match(cvePattern);
      if (cveMatches) {
        cveMatches.forEach(cve => tags.add(cve.toUpperCase()));
      }
      
      // Apply all pattern categories
      const allPatterns = {
        ...techPatterns,
        ...attackPatterns,
        ...industryPatterns,
        ...compliancePatterns,
        ...geoPatterns
      };
      
      // Match patterns against content
      for (const [tag, keywords] of Object.entries(allPatterns)) {
        if (keywords.some(keyword => content.includes(keyword))) {
          tags.add(tag);
        }
      }
      
      // Extract severity as tag
      const severity = this.assessSeverity(content);
      tags.add(`severity-${severity.toLowerCase()}`);
      
      // Extract incident type as tag
      const incidentType = this.detectIncidentType(content);
      tags.add(`incident-${incidentType.toLowerCase().replace('_', '-')}`);
      
      // Add year tag
      tags.add(`year-${new Date().getFullYear()}`);
      
      // Convert Set to Array and limit to reasonable number
      return Array.from(tags).slice(0, 15);
      
    } catch (error) {
      logger.error('Error generating tags:', error);
      return ['cybersecurity', 'security-incident'];
    }
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

  /**
   * Generate AI-powered company description and metadata
   */
  static generateCompanyProfile(companyName, articles = []) {
    try {
      // Analyze company from available articles and known data
      const profile = this.analyzeCompanyFromData(companyName, articles);
      
      return {
        description: profile.description,
        industry: profile.industry,
        stockTicker: profile.stockTicker,
        marketCap: profile.marketCap,
        founded: profile.founded,
        headquarters: profile.headquarters,
        employees: profile.employees,
        website: profile.website,
        competitors: profile.competitors,
        keyProducts: profile.keyProducts,
        businessModel: profile.businessModel
      };
    } catch (error) {
      logger.error('Error generating company profile:', error);
      return this.getFallbackProfile(companyName);
    }
  }

  static analyzeCompanyFromData(companyName, articles) {
    const name = companyName.toLowerCase();
    
    // Known company profiles (in production, this would be ML-based or API-driven)
    const knownCompanies = {
      'microsoft': {
        description: 'Microsoft Corporation is a multinational technology company that develops, manufactures, licenses, supports, and sells computer software, consumer electronics, personal computers, and related services. Known for Windows operating system, Office productivity suite, Azure cloud platform, and enterprise solutions.',
        industry: 'Technology',
        stockTicker: 'MSFT',
        marketCap: '$2.8T',
        founded: '1975',
        headquarters: 'Redmond, Washington',
        employees: '221,000+',
        website: 'https://www.microsoft.com',
        competitors: ['Apple', 'Google', 'Amazon', 'Oracle', 'IBM'],
        keyProducts: ['Windows', 'Office 365', 'Azure', 'Teams', 'Xbox'],
        businessModel: 'Software licensing, cloud services, hardware'
      },
      'apple': {
        description: 'Apple Inc. is a multinational technology company that designs, develops, and sells consumer electronics, computer software, and online services. Best known for iPhone smartphones, Mac computers, iPad tablets, and innovative consumer technology products.',
        industry: 'Technology',
        stockTicker: 'AAPL',
        marketCap: '$3.0T',
        founded: '1976',
        headquarters: 'Cupertino, California',
        employees: '164,000+',
        website: 'https://www.apple.com',
        competitors: ['Samsung', 'Google', 'Microsoft', 'Huawei', 'Dell'],
        keyProducts: ['iPhone', 'Mac', 'iPad', 'Apple Watch', 'AirPods'],
        businessModel: 'Hardware sales, services, software'
      },
      'google': {
        description: 'Google LLC is a multinational technology company specializing in internet-related services and products, including search engine, cloud computing, advertising technologies, and consumer electronics. Parent company Alphabet operates various subsidiaries.',
        industry: 'Technology',
        stockTicker: 'GOOGL',
        marketCap: '$1.7T',
        founded: '1998',
        headquarters: 'Mountain View, California',
        employees: '182,000+',
        website: 'https://www.google.com',
        competitors: ['Microsoft', 'Apple', 'Amazon', 'Meta', 'Oracle'],
        keyProducts: ['Search', 'YouTube', 'Gmail', 'Android', 'Google Cloud'],
        businessModel: 'Digital advertising, cloud services, hardware'
      },
      'amazon': {
        description: 'Amazon.com Inc. is a multinational technology and e-commerce company offering online marketplace, cloud computing, digital streaming, and artificial intelligence services. World\'s largest e-commerce and cloud computing platform.',
        industry: 'Technology/E-commerce',
        stockTicker: 'AMZN',
        marketCap: '$1.5T',
        founded: '1994',
        headquarters: 'Seattle, Washington',
        employees: '1.5M+',
        website: 'https://www.amazon.com',
        competitors: ['Microsoft', 'Google', 'Walmart', 'Alibaba', 'eBay'],
        keyProducts: ['AWS', 'Prime', 'Alexa', 'Kindle', 'Marketplace'],
        businessModel: 'E-commerce, cloud services, advertising'
      },
      'meta': {
        description: 'Meta Platforms Inc. (formerly Facebook) is a multinational technology company operating social networking platforms and developing virtual reality and metaverse technologies. Connects billions of people worldwide through social media.',
        industry: 'Social Media/Technology',
        stockTicker: 'META',
        marketCap: '$800B',
        founded: '2004',
        headquarters: 'Menlo Park, California',
        employees: '67,000+',
        website: 'https://about.meta.com',
        competitors: ['Google', 'TikTok', 'Twitter', 'Snapchat', 'YouTube'],
        keyProducts: ['Facebook', 'Instagram', 'WhatsApp', 'Messenger', 'Oculus'],
        businessModel: 'Digital advertising, virtual reality'
      },
      'tesla': {
        description: 'Tesla Inc. is an electric vehicle and clean energy company that designs, manufactures, and sells electric cars, energy storage systems, and solar panels. Leading innovation in sustainable transportation and energy.',
        industry: 'Automotive/Clean Energy',
        stockTicker: 'TSLA',
        marketCap: '$800B',
        founded: '2003',
        headquarters: 'Austin, Texas',
        employees: '127,000+',
        website: 'https://www.tesla.com',
        competitors: ['Ford', 'GM', 'Volkswagen', 'BYD', 'Rivian'],
        keyProducts: ['Model S/3/X/Y', 'Cybertruck', 'Solar Roof', 'Powerwall'],
        businessModel: 'Electric vehicle sales, energy products'
      }
    };

    // Try to find exact match first
    if (knownCompanies[name]) {
      return knownCompanies[name];
    }

    // Try partial matches
    for (const [key, profile] of Object.entries(knownCompanies)) {
      if (name.includes(key) || key.includes(name)) {
        return profile;
      }
    }

    // Generate basic profile from articles if available
    return this.generateProfileFromArticles(companyName, articles);
  }

  static generateProfileFromArticles(companyName, articles) {
    // Analyze industry from article content
    const industry = this.detectIndustryFromArticles(articles);
    
    return {
      description: `${companyName} is a company in the ${industry} sector. Information about their specific business operations and services can be found through their recent news coverage and security incident reports.`,
      industry: industry,
      stockTicker: 'Unknown',
      marketCap: 'Unknown',
      founded: 'Unknown',
      headquarters: 'Unknown',
      employees: 'Unknown',
      website: `https://www.${companyName.toLowerCase().replace(/\s+/g, '')}.com`,
      competitors: [],
      keyProducts: [],
      businessModel: 'Business operations in ' + industry
    };
  }

  static detectIndustryFromArticles(articles) {
    if (!articles || articles.length === 0) return 'Technology';
    
    const content = articles.map(a => `${a.title} ${a.description}`).join(' ').toLowerCase();
    
    const industryKeywords = {
      'Healthcare': ['health', 'medical', 'hospital', 'patient', 'healthcare', 'pharma'],
      'Finance': ['bank', 'financial', 'payment', 'credit', 'investment', 'finance'],
      'Technology': ['software', 'tech', 'cloud', 'data', 'digital', 'cyber'],
      'Retail': ['retail', 'store', 'shopping', 'customer', 'ecommerce'],
      'Energy': ['energy', 'oil', 'gas', 'power', 'electric', 'renewable'],
      'Manufacturing': ['manufacturing', 'factory', 'production', 'supply'],
      'Government': ['government', 'federal', 'agency', 'public', 'municipal'],
      'Education': ['school', 'university', 'education', 'student', 'academic']
    };

    for (const [industry, keywords] of Object.entries(industryKeywords)) {
      if (keywords.some(keyword => content.includes(keyword))) {
        return industry;
      }
    }

    return 'Technology'; // Default fallback
  }

  static getFallbackProfile(companyName) {
    return {
      description: `${companyName} is a company that appears in cybersecurity news and incident reports. Specific business details are being gathered from ongoing analysis.`,
      industry: 'Unknown',
      stockTicker: 'Unknown',
      marketCap: 'Unknown',
      founded: 'Unknown',
      headquarters: 'Unknown',
      employees: 'Unknown',
      website: 'Unknown',
      competitors: [],
      keyProducts: [],
      businessModel: 'Unknown'
    };
  }
}

module.exports = AIService;
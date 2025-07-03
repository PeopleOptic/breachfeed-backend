const { getPrismaClient } = require('../utils/database');
const sgMail = require('@sendgrid/mail');
const apn = require('apn');
const logger = require('../utils/logger');
const { notificationQueue } = require('./queueService');

const prisma = getPrismaClient();

// Initialize services conditionally
let sgMailInitialized = false;
let twilioClient = null;

if (process.env.SENDGRID_API_KEY && process.env.SENDGRID_API_KEY.startsWith('SG.')) {
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  sgMailInitialized = true;
  logger.info('SendGrid initialized successfully');
} else {
  logger.warn('SendGrid not initialized: SENDGRID_API_KEY missing or invalid');
}

if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    logger.info('Twilio initialized successfully');
  } catch (error) {
    logger.warn('Twilio initialization failed:', error.message);
  }
} else {
  logger.warn('Twilio not initialized: TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN missing');
}

// Initialize APNS
let apnProvider;
if (process.env.APNS_KEY_PATH && process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID) {
  try {
    apnProvider = new apn.Provider({
      token: {
        key: process.env.APNS_KEY_PATH,
        keyId: process.env.APNS_KEY_ID,
        teamId: process.env.APNS_TEAM_ID,
      },
      production: process.env.NODE_ENV === 'production'
    });
  } catch (error) {
    logger.warn('APNS not initialized:', error.message);
  }
}

async function queueNotifications(article, matches) {
  try {
    // Get unique entity IDs from matches
    const companyIds = matches
      .filter(m => m.type === 'company')
      .map(m => m.id);
    const keywordIds = matches
      .filter(m => m.type === 'keyword')
      .map(m => m.id);
    const agencyIds = matches
      .filter(m => m.type === 'agency')
      .map(m => m.id);
    const locationIds = matches
      .filter(m => m.type === 'location')
      .map(m => m.id);
    
    // Find all active subscriptions for these matches
    const subscriptions = await prisma.subscription.findMany({
      where: {
        isActive: true,
        OR: [
          { type: 'COMPANY', targetId: { in: companyIds } },
          { type: 'KEYWORD', targetId: { in: keywordIds } },
          { type: 'AGENCY', targetId: { in: agencyIds } },
          { type: 'LOCATION', targetId: { in: locationIds } }
        ]
      },
      include: {
        user: true,
        company: true,
        keyword: true,
        agency: true,
        location: true
      }
    });
    
    // Filter subscriptions based on alert type preferences
    const filteredSubscriptions = subscriptions.filter(subscription => {
      // Check if the article's alert type is in the subscription's alert type filter
      const alertTypeFilter = subscription.alertTypeFilter || ['CONFIRMED_BREACH', 'SECURITY_INCIDENT', 'SECURITY_MENTION'];
      const articleAlertType = article.alertType || 'SECURITY_MENTION';
      
      if (!alertTypeFilter.includes(articleAlertType)) {
        logger.debug(`Subscription ${subscription.id} filtered out - alert type ${articleAlertType} not in filter: [${alertTypeFilter.join(', ')}]`);
        return false;
      }
      
      // Check severity filter if set
      if (subscription.severityFilter) {
        const severityOrder = { 'LOW': 1, 'MEDIUM': 2, 'HIGH': 3, 'CRITICAL': 4 };
        const articleSeverity = severityOrder[article.severity] || 2;
        const minSeverity = severityOrder[subscription.severityFilter] || 2;
        
        if (articleSeverity < minSeverity) {
          logger.debug(`Subscription ${subscription.id} filtered out - severity ${article.severity} below threshold ${subscription.severityFilter}`);
          return false;
        }
      }
      
      return true;
    });
    
    // Queue notifications for each filtered subscription with priority based on alert type
    for (const subscription of filteredSubscriptions) {
      const alertType = article.alertType || 'SECURITY_MENTION';
      const priority = getNotificationPriority(alertType);
      
      if (subscription.emailEnabled && notificationQueue) {
        await notificationQueue.add('email', {
          userId: subscription.userId,
          articleId: article.id,
          subscription,
          alertType: alertType,
          priority: priority
        }, {
          priority: priority,
          delay: alertType === 'CONFIRMED_BREACH' ? 0 : 1000 // Immediate for breaches, slight delay for others
        });
      }
      
      if (subscription.smsEnabled && subscription.user.phoneNumber && notificationQueue) {
        await notificationQueue.add('sms', {
          userId: subscription.userId,
          articleId: article.id,
          subscription,
          alertType: alertType,
          priority: priority
        }, {
          priority: priority,
          delay: alertType === 'CONFIRMED_BREACH' ? 0 : 2000
        });
      }
      
      if (subscription.pushEnabled && subscription.user.apnsDeviceToken && notificationQueue) {
        await notificationQueue.add('push', {
          userId: subscription.userId,
          articleId: article.id,
          subscription,
          alertType: alertType,
          priority: priority
        }, {
          priority: priority,
          delay: alertType === 'CONFIRMED_BREACH' ? 0 : 1500
        });
      }
    }
    
    logger.info(`Queued notifications for ${filteredSubscriptions.length} filtered subscriptions (${subscriptions.length} total found)`);
  } catch (error) {
    logger.error('Error queueing notifications:', error);
  }
}

async function sendEmailNotification(job) {
  const { userId, articleId, subscription } = job.data;
  
  try {
    const article = await prisma.article.findUnique({
      where: { id: articleId },
      include: { feed: true }
    });
    
    if (!article) return;
    
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user || !user.email) return;
    
    // Build email content
    const matchType = getMatchType(subscription);
    const severity = article.severity || 'MEDIUM';
    const alertType = article.alertType || 'SECURITY_MENTION';
    
    const severityColors = {
      'CRITICAL': '#d32f2f',
      'HIGH': '#f57c00', 
      'MEDIUM': '#fbc02d',
      'LOW': '#388e3c'
    };
    
    const alertTypeInfo = {
      'CONFIRMED_BREACH': {
        emoji: '🚨',
        label: 'CONFIRMED BREACH',
        color: '#d32f2f',
        description: 'A security breach has been confirmed'
      },
      'SECURITY_INCIDENT': {
        emoji: '⚠️',
        label: 'ACTIVE INCIDENT',
        color: '#f57c00',
        description: 'A security incident is being investigated'
      },
      'SECURITY_MENTION': {
        emoji: 'ℹ️',
        label: 'SECURITY UPDATE',
        color: '#1976d2',
        description: 'Security-related information has been reported'
      }
    };
    
    const alertInfo = alertTypeInfo[alertType] || alertTypeInfo['SECURITY_MENTION'];
    
    // Create excerpt (first 200 characters)
    const excerpt = article.description ? 
      (article.description.length > 200 ? 
        article.description.substring(0, 200) + '...' : 
        article.description) : 
      'No description available.';
    
    const msg = {
      to: user.email,
      from: process.env.SENDGRID_FROM_EMAIL,
      subject: `${alertInfo.emoji} BreachFeed ${alertInfo.label}: ${matchType}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, ${alertInfo.color} 0%, #764ba2 100%); color: white; padding: 20px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">${alertInfo.emoji} BreachFeed ${alertInfo.label}</h1>
            <p style="margin: 5px 0; opacity: 0.9;">${alertInfo.description}</p>
            <div style="background: ${severityColors[severity]}; color: white; padding: 5px 15px; border-radius: 20px; display: inline-block; margin-top: 10px; font-weight: bold;">
              ${severity} SEVERITY
            </div>
          </div>
          
          <div style="padding: 30px; background: white;">
            <div style="background: #f8f9fa; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
              <strong style="color: #666; font-size: 14px;">MATCHED ALERT:</strong><br>
              <span style="font-size: 18px; color: #2c3e50;">${matchType}</span>
            </div>
            
            ${article.imageUrl ? `<img src="${article.imageUrl}" alt="Article image" style="width: 100%; max-height: 200px; object-fit: cover; border-radius: 8px; margin-bottom: 20px;">` : ''}
            
            <h2 style="color: #2c3e50; margin: 0 0 15px 0; line-height: 1.3;">${article.title}</h2>
            
            ${article.summary ? `
              <div style="background: #e3f2fd; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #1976d2;">
                <strong style="color: #1976d2;">AI Summary:</strong><br>
                <span style="color: #333;">${article.summary}</span>
              </div>
            ` : ''}
            
            <div style="margin-bottom: 20px;">
              <strong>Excerpt:</strong><br>
              <p style="color: #555; line-height: 1.6; margin: 10px 0;">${excerpt}</p>
            </div>
            
            ${article.recommendations ? `
              <div style="background: #fff3e0; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #ff9800;">
                <strong style="color: #f57c00;">🔧 Recommended Actions:</strong><br>
                <div style="color: #333; margin-top: 10px; white-space: pre-line; font-size: 14px;">${article.recommendations}</div>
              </div>
            ` : ''}
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${article.link}" 
                 style="background: #1976d2; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                Read Full Article →
              </a>
            </div>
            
            <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 14px; color: #666;">
              <p><strong>Published:</strong> ${new Date(article.publishedAt).toLocaleDateString()}</p>
              <p><strong>Source:</strong> ${article.feed.name}</p>
              <p><strong>Confidence:</strong> High match for your alert criteria</p>
            </div>
          </div>
          
          <div style="background: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #666;">
            <p>You're receiving this because you subscribed to ${matchType} alerts.</p>
            <p>Powered by <strong>BreachFeed</strong> - Real-time cybersecurity intelligence</p>
          </div>
        </div>
      `
    };
    
    if (!sgMailInitialized) {
      logger.warn('SendGrid not initialized, skipping email notification');
      return;
    }
    
    await sgMail.send(msg);
    
    // Record notification
    await prisma.notification.create({
      data: {
        userId,
        articleId,
        type: 'EMAIL',
        status: 'SENT',
        sentAt: new Date()
      }
    });
    
  } catch (error) {
    logger.error('Error sending email notification:', error);
    
    // Record failed notification
    await prisma.notification.create({
      data: {
        userId,
        articleId,
        type: 'EMAIL',
        status: 'FAILED',
        error: error.message
      }
    });
    
    throw error;
  }
}

async function sendSmsNotification(job) {
  const { userId, articleId, subscription } = job.data;
  
  try {
    const article = await prisma.article.findUnique({
      where: { id: articleId }
    });
    
    if (!article) return;
    
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user || !user.phoneNumber) return;
    
    const matchType = getMatchType(subscription);
    const severity = article.severity || 'MEDIUM';
    const alertType = article.alertType || 'SECURITY_MENTION';
    
    const alertEmojis = {
      'CONFIRMED_BREACH': '🚨',
      'SECURITY_INCIDENT': '⚠️',
      'SECURITY_MENTION': 'ℹ️'
    };
    
    const alertLabels = {
      'CONFIRMED_BREACH': 'BREACH CONFIRMED',
      'SECURITY_INCIDENT': 'ACTIVE INCIDENT',
      'SECURITY_MENTION': 'Security Alert'
    };
    
    const alertEmoji = alertEmojis[alertType] || alertEmojis['SECURITY_MENTION'];
    const alertLabel = alertLabels[alertType] || alertLabels['SECURITY_MENTION'];
    
    // Create a concise excerpt for SMS
    const excerpt = article.summary || article.description || '';
    const shortExcerpt = excerpt.length > 60 ? excerpt.substring(0, 60) + '...' : excerpt;
    
    const message = `${alertEmoji} BreachFeed ${alertLabel}
${matchType}: ${article.title}
Severity: ${severity}
${shortExcerpt}
Read: ${article.link}`;
    
    if (!twilioClient) {
      logger.warn('Twilio not initialized, skipping SMS notification');
      return;
    }
    
    await twilioClient.messages.create({
      body: message.substring(0, 1600), // SMS limit
      from: process.env.TWILIO_PHONE_NUMBER,
      to: user.phoneNumber
    });
    
    // Record notification
    await prisma.notification.create({
      data: {
        userId,
        articleId,
        type: 'SMS',
        status: 'SENT',
        sentAt: new Date()
      }
    });
    
  } catch (error) {
    logger.error('Error sending SMS notification:', error);
    
    // Record failed notification
    await prisma.notification.create({
      data: {
        userId,
        articleId,
        type: 'SMS',
        status: 'FAILED',
        error: error.message
      }
    });
    
    throw error;
  }
}

async function sendPushNotification(job) {
  const { userId, articleId, subscription } = job.data;
  
  if (!apnProvider) {
    logger.error('APNS not configured');
    return;
  }
  
  try {
    const article = await prisma.article.findUnique({
      where: { id: articleId }
    });
    
    if (!article) return;
    
    const user = await prisma.user.findUnique({
      where: { id: userId }
    });
    
    if (!user || !user.apnsDeviceToken) return;
    
    const matchType = getMatchType(subscription);
    const severity = article.severity || 'MEDIUM';
    
    const notification = new apn.Notification();
    notification.alert = {
      title: `🛡️ ${severity} Security Alert`,
      subtitle: matchType,
      body: article.title
    };
    notification.topic = process.env.APNS_BUNDLE_ID;
    notification.sound = 'default';
    notification.badge = 1;
    notification.payload = {
      articleId: article.id,
      link: article.link,
      severity: severity,
      summary: article.summary,
      recommendations: article.recommendations
    };
    
    const result = await apnProvider.send(notification, user.apnsDeviceToken);
    
    if (result.failed.length > 0) {
      throw new Error(result.failed[0].response.reason);
    }
    
    // Record notification
    await prisma.notification.create({
      data: {
        userId,
        articleId,
        type: 'PUSH',
        status: 'SENT',
        sentAt: new Date()
      }
    });
    
  } catch (error) {
    logger.error('Error sending push notification:', error);
    
    // Record failed notification
    await prisma.notification.create({
      data: {
        userId,
        articleId,
        type: 'PUSH',
        status: 'FAILED',
        error: error.message
      }
    });
    
    throw error;
  }
}

/**
 * Get notification priority based on alert type
 */
function getNotificationPriority(alertType) {
  switch(alertType) {
    case 'CONFIRMED_BREACH':
      return 10; // Highest priority
    case 'SECURITY_INCIDENT':
      return 5;  // Medium priority
    case 'SECURITY_MENTION':
      return 1;  // Lowest priority
    default:
      return 1;
  }
}

/**
 * Get human-readable match type description
 */
function getMatchType(subscription) {
  switch(subscription.type) {
    case 'COMPANY':
      return `Company: ${subscription.company?.name || 'Unknown'}`;
    case 'KEYWORD':
      return `Keyword: ${subscription.keyword?.term || 'Unknown'}`;
    case 'AGENCY':
      return `Agency: ${subscription.agency?.name || 'Unknown'}`;
    case 'LOCATION':
      return `Location: ${subscription.location?.name || 'Unknown'}`;
    default:
      return 'Unknown Alert Type';
  }
}

module.exports = {
  queueNotifications,
  sendEmailNotification,
  sendSmsNotification,
  sendPushNotification
};
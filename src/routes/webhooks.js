const express = require('express');
const { getPrismaClient } = require('../utils/database');
const logger = require('../utils/logger');

const router = express.Router();
const prisma = getPrismaClient();

// Webhook for SendGrid events
router.post('/sendgrid', async (req, res, next) => {
  try {
    const events = req.body;
    
    for (const event of events) {
      if (event.event === 'bounce' || event.event === 'dropped') {
        logger.warn(`Email delivery failed for ${event.email}: ${event.reason}`);
        
        // Could update user record to mark email as invalid
        // await prisma.user.update({
        //   where: { email: event.email },
        //   data: { emailValid: false }
        // });
      }
    }
    
    res.status(200).send();
  } catch (error) {
    logger.error('SendGrid webhook error:', error);
    res.status(200).send(); // Always return 200 to prevent retries
  }
});

// Webhook for Twilio status callbacks
router.post('/twilio', async (req, res, next) => {
  try {
    const { MessageStatus, To, ErrorCode } = req.body;
    
    if (MessageStatus === 'failed' || MessageStatus === 'undelivered') {
      logger.warn(`SMS delivery failed to ${To}: ${ErrorCode}`);
      
      // Could update user record to mark phone as invalid
    }
    
    res.status(200).send();
  } catch (error) {
    logger.error('Twilio webhook error:', error);
    res.status(200).send();
  }
});

module.exports = router;
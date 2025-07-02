const express = require('express');
const { authenticateApiKey } = require('../middleware/auth');

const router = express.Router();

// Simple test endpoint that doesn't use database
router.get('/ping', authenticateApiKey, async (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'API is working'
  });
});

module.exports = router;
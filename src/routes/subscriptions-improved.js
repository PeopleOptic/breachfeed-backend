// Improved subscription creation logic using separate ID fields

// Quick subscribe endpoint for article detail pages
router.post('/quick', authenticateApiKey, validateRequest(quickSubscribeSchema), async (req, res, next) => {
  try {
    const { entityType, entityId, entityName } = req.body;
    const userIdHeader = req.headers['x-user-id'];
    const userEmail = req.headers['x-user-email'];
    
    console.log('Quick subscribe request:', { entityType, entityId, entityName, userEmail });
    
    // Get user
    let user = null;
    let userId = null;
    
    // ... user authentication logic ...
    
    // Prepare subscription data with the correct ID field
    const subscriptionData = {
      userId,
      type: entityType,
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: false,
      isActive: true,
      alertTypeFilter: ['CONFIRMED_BREACH', 'SECURITY_INCIDENT', 'SECURITY_MENTION']
    };
    
    // Set the appropriate ID field based on entity type
    switch (entityType) {
      case 'COMPANY':
        subscriptionData.companyId = entityId;
        break;
      case 'AGENCY':
        subscriptionData.agencyId = entityId;
        break;
      case 'LOCATION':
        subscriptionData.locationId = entityId;
        break;
      case 'KEYWORD':
        subscriptionData.keywordId = entityId;
        break;
      default:
        return res.status(400).json({ error: 'Invalid entity type' });
    }
    
    // Check if subscription already exists using the specific ID field
    const whereClause = {
      userId,
      type: entityType
    };
    whereClause[entityType.toLowerCase() + 'Id'] = entityId;
    
    const existingSubscription = await prisma.subscription.findFirst({
      where: whereClause
    });
    
    if (existingSubscription) {
      if (!existingSubscription.isActive) {
        // Reactivate existing subscription
        const updated = await prisma.subscription.update({
          where: { id: existingSubscription.id },
          data: { isActive: true }
        });
        return res.json({ message: 'Subscription reactivated', subscription: updated });
      }
      return res.status(409).json({ 
        error: 'Subscription already exists',
        subscriptionId: existingSubscription.id 
      });
    }
    
    // Create subscription
    try {
      const subscription = await prisma.subscription.create({
        data: subscriptionData,
        include: {
          company: entityType === 'COMPANY',
          keyword: entityType === 'KEYWORD',
          agency: entityType === 'AGENCY',
          location: entityType === 'LOCATION'
        }
      });
      
      res.status(201).json({
        message: `Subscribed to ${entityName}`,
        subscription
      });
    } catch (createErr) {
      console.error('Subscription creation error:', createErr);
      if (createErr.code === 'P2003') {
        // Foreign key constraint error - entity doesn't exist
        return res.status(400).json({ 
          error: `The ${entityType.toLowerCase()} "${entityName}" does not exist`,
          details: 'Please ensure the entity exists before subscribing'
        });
      }
      throw createErr;
    }
  } catch (error) {
    console.error('Quick subscribe error:', error);
    next(error);
  }
});
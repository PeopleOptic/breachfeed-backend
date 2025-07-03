const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testSubscription() {
  try {
    const userId = 'test-user-123';
    const entityType = 'COMPANY';
    const entityId = 'cmcdstyqw0000wxjhkr64jr21';
    const entityName = 'Microsoft';
    
    console.log('Testing subscription with new schema...');
    
    // First, ensure user exists
    let user = await prisma.user.findUnique({
      where: { email: 'test@example.com' }
    });
    
    if (!user) {
      user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User'
        }
      });
      console.log('Created test user:', user.id);
    }
    
    // Check if entity exists
    const company = await prisma.company.findUnique({
      where: { id: entityId }
    });
    
    console.log('Company exists:', !!company);
    
    // Try to create subscription with new schema
    const subscriptionData = {
      userId: user.id,
      type: entityType,
      targetId: entityId, // Keep for backward compatibility
      companyId: entityId, // New field
      emailEnabled: true,
      smsEnabled: false,
      pushEnabled: false,
      isActive: true,
      alertTypeFilter: ['CONFIRMED_BREACH', 'SECURITY_INCIDENT', 'SECURITY_MENTION']
    };
    
    console.log('Creating subscription with data:', subscriptionData);
    
    const subscription = await prisma.subscription.create({
      data: subscriptionData,
      include: {
        company: true
      }
    });
    
    console.log('SUCCESS! Subscription created:', subscription);
    
  } catch (error) {
    console.error('Error:', error.message);
    if (error.code === 'P2003') {
      console.error('Foreign key constraint error - details:', error.meta);
    }
  } finally {
    await prisma.$disconnect();
  }
}

testSubscription();
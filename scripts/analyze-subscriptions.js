const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function analyzeSubscriptions() {
  try {
    // Count subscriptions by type
    const subscriptionCounts = await prisma.subscription.groupBy({
      by: ['type'],
      _count: true
    });
    
    console.log('Subscription counts by type:');
    subscriptionCounts.forEach(count => {
      console.log(`  ${count.type}: ${count._count}`);
    });
    
    // Check for any subscriptions with null targetId
    const nullTargetCount = await prisma.subscription.count({
      where: { targetId: null }
    });
    console.log(`\nSubscriptions with null targetId: ${nullTargetCount}`);
    
    // Sample some subscriptions
    const samples = await prisma.subscription.findMany({
      take: 10,
      include: {
        user: true,
        company: true,
        agency: true,
        location: true,
        keyword: true
      }
    });
    
    console.log('\nSample subscriptions:');
    samples.forEach(sub => {
      console.log(`  ID: ${sub.id}`);
      console.log(`  Type: ${sub.type}`);
      console.log(`  TargetId: ${sub.targetId}`);
      console.log(`  User: ${sub.user.email}`);
      console.log(`  Related entity: ${sub.company?.name || sub.agency?.name || sub.location?.name || sub.keyword?.term || 'None'}`);
      console.log('  ---');
    });
    
  } catch (error) {
    console.error('Error analyzing subscriptions:', error);
  } finally {
    await prisma.$disconnect();
  }
}

analyzeSubscriptions();
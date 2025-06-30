# BreachFeed Alert Classification System - Deployment Guide

## 🚀 Quick Deployment

### Prerequisites
- Node.js 18+ installed
- PostgreSQL database running and accessible
- Environment variables configured

### Option 1: Automated Deployment (Recommended)
```bash
# 1. Configure environment
cp .env.example .env
# Edit .env with your database URL and service credentials

# 2. Run deployment script
./deploy-alert-classification.sh
```

### Option 2: Manual Step-by-Step Deployment

#### Step 1: Environment Setup
```bash
# Copy and configure environment file
cp .env.example .env

# Edit .env file with your settings:
# DATABASE_URL="postgresql://user:password@host:port/database"
# SENDGRID_API_KEY="your-key"
# etc.
```

#### Step 2: Install Dependencies
```bash
npm install
```

#### Step 3: Database Migration
```bash
# Generate Prisma client
npx prisma generate

# Apply schema changes
npx prisma db push

# OR if you prefer migrations:
npx prisma migrate deploy
```

#### Step 4: Update Existing Data
```bash
# Update existing articles with default alert types
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.article.updateMany({
  where: { alertType: null },
  data: { alertType: 'SECURITY_MENTION', classificationConfidence: 0.5 }
}).then(result => {
  console.log(\`Updated \${result.count} articles\`);
  process.exit(0);
}).catch(console.error);
"
```

#### Step 5: Test System
```bash
# Run classification tests
node test/test-alert-classification.js

# Start the server
npm run start:prod
```

## 🔧 Configuration Options

### Alert Type Filtering
Users can now configure which alert types they want to receive:

```javascript
// Example subscription update
await prisma.subscription.update({
  where: { id: subscriptionId },
  data: {
    alertTypeFilter: ['CONFIRMED_BREACH', 'SECURITY_INCIDENT']
    // Will only receive high and medium priority alerts
  }
});
```

### Default Settings
- New subscriptions default to receiving all alert types
- Existing articles are classified as 'SECURITY_MENTION'
- Classification confidence starts at 0.5 (50%)

## 📊 Monitoring & Verification

### Check Alert Classification
```bash
# View recent articles with their classifications
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.article.findMany({
  take: 10,
  orderBy: { createdAt: 'desc' },
  select: { title: true, alertType: true, classificationConfidence: true }
}).then(articles => {
  console.table(articles);
  process.exit(0);
}).catch(console.error);
"
```

### Monitor Classifications in Logs
Look for log entries like:
```
[INFO] Article classified as CONFIRMED_BREACH with confidence 0.85
[INFO] Queued notifications for 5 filtered subscriptions (8 total found)
```

## 🚨 Alert Type Examples

### CONFIRMED_BREACH
- "Company confirms data breach affecting 2M customers"
- "Ransomware encrypted hospital systems"
- "SEC filing reveals cyber attack"

### SECURITY_INCIDENT  
- "Healthcare provider investigating potential breach"
- "City systems under cyberattack"
- "Company responding to security incident"

### SECURITY_MENTION
- "New cybersecurity framework released"
- "Expert analysis of recent breaches"
- "Security best practices guide"

## 🔄 Rollback Plan

### If Issues Occur:
1. **Stop the service**
2. **Restore from backup** (if created):
   ```bash
   psql $DATABASE_URL < backup_file.sql
   ```
3. **Or reset to previous schema**:
   ```bash
   npx prisma migrate reset
   # Then redeploy previous version
   ```

## 📈 Performance Impact

### Expected Changes:
- ✅ **Improved notification relevance** - Users get fewer false positives
- ✅ **Priority-based delivery** - Critical alerts delivered immediately
- ✅ **Better user experience** - Clear visual indicators for alert types
- ⚠️ **Slight processing overhead** - Additional classification step (~10ms per article)

### Monitoring Points:
- Article processing time
- Notification delivery rates
- User engagement with different alert types
- Classification accuracy

## 🆘 Troubleshooting

### Common Issues:

**"Environment variable not found: DATABASE_URL"**
- Solution: Ensure .env file exists and DATABASE_URL is set

**"Cannot connect to database"**
- Solution: Check database is running and credentials are correct

**"Prisma schema validation error"**
- Solution: Run `npx prisma generate` and `npx prisma db push`

**"Alert classification not working"**
- Solution: Check logs and run `node test/test-alert-classification.js`

### Support:
- Check application logs: `tail -f logs/app.log`
- Test classification: `node test/test-alert-classification.js`
- Verify database: `npx prisma studio`
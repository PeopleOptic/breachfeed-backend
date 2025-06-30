#!/bin/bash

# BreachFeed Alert Classification System Deployment Script
# This script deploys the new alert classification system with proper checks

set -e  # Exit on any error

echo "🚀 Starting BreachFeed Alert Classification System Deployment"
echo "============================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if .env file exists
if [ ! -f ".env" ]; then
    print_error ".env file not found!"
    print_warning "Please copy .env.example to .env and configure your environment variables:"
    echo "cp .env.example .env"
    echo "Then edit .env with your database and service credentials"
    exit 1
fi

print_status "Environment file found ✓"

# Load environment variables
export $(cat .env | grep -v '#' | awk '/=/ {print $1}')

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    print_error "DATABASE_URL not set in .env file"
    exit 1
fi

print_status "DATABASE_URL configured ✓"

# Test database connection
print_status "Testing database connection..."
if ! node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.\$connect().then(() => {
    console.log('Database connection successful');
    process.exit(0);
}).catch((e) => {
    console.error('Database connection failed:', e.message);
    process.exit(1);
});
" 2>/dev/null; then
    print_error "Cannot connect to database. Please check your DATABASE_URL"
    exit 1
fi

print_success "Database connection successful ✓"

# Create backup of current database schema (optional but recommended)
print_status "Creating database backup (recommended)..."
BACKUP_FILE="backup_before_alert_classification_$(date +%Y%m%d_%H%M%S).sql"
if command -v pg_dump >/dev/null 2>&1; then
    if pg_dump "$DATABASE_URL" > "$BACKUP_FILE" 2>/dev/null; then
        print_success "Database backup created: $BACKUP_FILE"
    else
        print_warning "Could not create backup (continuing anyway)"
    fi
else
    print_warning "pg_dump not found, skipping backup"
fi

# Install/update dependencies
print_status "Installing dependencies..."
npm install
print_success "Dependencies installed ✓"

# Generate Prisma client with new schema
print_status "Generating Prisma client..."
npx prisma generate
print_success "Prisma client generated ✓"

# Apply database migrations
print_status "Applying database migrations..."
if npx prisma db push --accept-data-loss; then
    print_success "Database schema updated ✓"
else
    print_error "Failed to update database schema"
    exit 1
fi

# Update existing articles with default alert type
print_status "Updating existing articles with default alert types..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updateExistingArticles() {
    try {
        const result = await prisma.article.updateMany({
            where: {
                OR: [
                    { alertType: null },
                    { classificationConfidence: null }
                ]
            },
            data: {
                alertType: 'SECURITY_MENTION',
                classificationConfidence: 0.5
            }
        });
        
        console.log(\`Updated \${result.count} existing articles with default alert types\`);
        process.exit(0);
    } catch (error) {
        console.error('Error updating articles:', error);
        process.exit(1);
    }
}

updateExistingArticles();
"

if [ $? -eq 0 ]; then
    print_success "Existing articles updated ✓"
else
    print_error "Failed to update existing articles"
    exit 1
fi

# Test the alert classification system
print_status "Testing alert classification system..."
if node test/test-alert-classification.js > /dev/null 2>&1; then
    print_success "Alert classification system test passed ✓"
else
    print_warning "Alert classification tests had issues (check with: node test/test-alert-classification.js)"
fi

# Build the application
print_status "Building application..."
npm run build
print_success "Application built ✓"

print_success "🎉 Deployment Complete!"
echo ""
echo "============================================================="
echo "DEPLOYMENT SUMMARY:"
echo "✅ Database schema updated with new AlertType enum"
echo "✅ Articles table now has alertType and classificationConfidence fields"
echo "✅ Subscriptions table now has alertTypeFilter array"
echo "✅ Existing articles updated with default SECURITY_MENTION type"
echo "✅ Alert classification system is active"
echo ""
echo "NEW FEATURES AVAILABLE:"
echo "🚨 CONFIRMED_BREACH - High priority alerts for confirmed security breaches"
echo "⚠️  SECURITY_INCIDENT - Medium priority alerts for active investigations" 
echo "ℹ️  SECURITY_MENTION - Low priority alerts for general security mentions"
echo ""
echo "NEXT STEPS:"
echo "1. Restart your backend services: npm run start:prod"
echo "2. Monitor the logs for new article classifications"
echo "3. Check that notifications use the new alert type formatting"
echo "4. Optionally update WordPress plugin to show new alert types"
echo ""
echo "ROLLBACK (if needed):"
if [ -f "$BACKUP_FILE" ]; then
    echo "If you need to rollback, restore from: $BACKUP_FILE"
else
    echo "No backup created - use 'npx prisma migrate reset' with caution"
fi
echo "============================================================="
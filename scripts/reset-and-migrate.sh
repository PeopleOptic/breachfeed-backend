#!/bin/bash

# Reset and Migrate Script for Railway Deployment
# This script will reset the database and run migrations from scratch

echo "🚨 WARNING: This will DELETE ALL DATA in the database!"
echo "Press Ctrl+C to cancel, or wait 5 seconds to continue..."
sleep 5

# Load environment variables
set -a
source .env
set +a

echo "📦 Installing dependencies..."
npm install

echo "🔄 Generating Prisma client..."
npx prisma generate

echo "🗑️  Resetting database..."
# Reset the database by dropping all tables
npx prisma db execute --file ./reset-database.sql

echo "📊 Creating fresh migrations..."
# Remove old migrations folder if it exists
rm -rf prisma/migrations

# Create a new migration with the complete schema
npx prisma migrate dev --name init --create-only

echo "🚀 Applying migrations..."
# Deploy the migrations to production
npx prisma migrate deploy

echo "✅ Database reset complete!"
echo "📝 Running initial data setup if available..."

# You can add seed data here if needed
# npx prisma db seed

echo "🎉 All done! The database has been reset with the complete schema."
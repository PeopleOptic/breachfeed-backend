# BreachFeed Backend API

Backend API for the BreachFeed cybersecurity notification system. Aggregates RSS feeds, matches keywords/companies, and sends notifications via email, SMS, and push notifications.

## Features

- RSS feed aggregation with near real-time processing
- Keyword and company matching in articles
- Multi-channel notifications (Email via SendGrid, SMS via Twilio, iOS Push via APNS)
- RESTful API for WordPress plugin integration
- User subscription management
- Article search and filtering
- Background job processing with Redis/Bull

## Prerequisites

- Node.js 18+
- PostgreSQL
- Redis
- SendGrid account (for email)
- Twilio account (for SMS)
- Apple Developer account (for push notifications)

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and configure:
   ```bash
   cp .env.example .env
   ```

4. Set up the database:
   ```bash
   npx prisma generate
   npx prisma migrate dev
   ```

5. Start the server:
   ```bash
   npm run dev
   ```

## API Endpoints

### Feeds
- `GET /api/feeds` - List all RSS feeds
- `POST /api/feeds` - Add new RSS feed
- `GET /api/feeds/:id` - Get single feed
- `PATCH /api/feeds/:id` - Update feed
- `DELETE /api/feeds/:id` - Delete feed
- `POST /api/feeds/:id/fetch` - Manually trigger feed fetch

### Articles
- `GET /api/articles` - List articles (paginated)
- `GET /api/articles/search` - Search articles with filters
- `GET /api/articles/:id` - Get single article
- `GET /api/articles/keyword/:keywordId` - Get articles by keyword

### Users
- `POST /api/users/register` - Register/update user
- `GET /api/users/profile` - Get user profile
- `PATCH /api/users/profile` - Update profile
- `POST /api/users/device-token` - Update push token

### Subscriptions
- `GET /api/subscriptions` - List user subscriptions
- `POST /api/subscriptions` - Create subscription
- `PATCH /api/subscriptions/:id` - Update subscription
- `DELETE /api/subscriptions/:id` - Delete subscription
- `GET /api/subscriptions/companies` - List companies
- `POST /api/subscriptions/companies` - Add company
- `GET /api/subscriptions/keywords` - List keywords
- `POST /api/subscriptions/keywords` - Add keyword

### Notifications
- `GET /api/notifications` - Get notification history
- `GET /api/notifications/stats` - Get notification statistics

## Authentication

- WordPress Plugin: Use `X-API-Key` header
- User endpoints: Use JWT Bearer token

## Deployment

### Railway
1. Create new project on Railway
2. Add PostgreSQL and Redis services
3. Deploy from GitHub
4. Set environment variables

### Vercel
1. Use Vercel PostgreSQL and Upstash Redis
2. Deploy using Vercel CLI or GitHub integration
3. Configure environment variables

## License

MIT
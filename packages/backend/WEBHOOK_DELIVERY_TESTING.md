# Webhook Delivery Logging System - Testing Guide

## Overview
This guide provides instructions for testing the webhook delivery logging system implemented in Task #35.

## Setup

### 1. Run Database Migration

```bash
cd /Users/leonhoulier/media-buying-governance/packages/backend
pnpm prisma migrate dev
```

This will apply the `20260208013537_add_webhook_deliveries` migration.

### 2. Generate Prisma Client

```bash
pnpm prisma generate
```

### 3. Start the Backend Server

```bash
pnpm dev
```

## Testing Scenarios

### Test 1: Successful Webhook Delivery

1. Create a webhook endpoint (you can use [webhook.site](https://webhook.site) for testing):

```bash
curl -X POST http://localhost:3000/api/v1/admin/webhooks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://webhook.site/YOUR-UNIQUE-ID",
    "events": ["compliance.violated"],
    "secret": "test-secret-key",
    "active": true,
    "description": "Test webhook"
  }'
```

2. Trigger a compliance event that will fire the webhook (this depends on your compliance event system).

3. Check that the delivery was logged:

```bash
curl -X GET "http://localhost:3000/api/v1/admin/webhooks/deliveries" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test 2: Failed Webhook Delivery

1. Create a webhook with an invalid/unreachable URL:

```bash
curl -X POST http://localhost:3000/api/v1/admin/webhooks \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://invalid-domain-that-does-not-exist-12345.com/webhook",
    "events": ["compliance.violated"],
    "secret": "test-secret-key",
    "active": true
  }'
```

2. Trigger a compliance event.

3. Verify the failed delivery was logged with error details:

```bash
curl -X GET "http://localhost:3000/api/v1/admin/webhooks/deliveries?success=false" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test 3: Filter by Webhook ID

1. Get the ID of a specific webhook:

```bash
curl -X GET "http://localhost:3000/api/v1/admin/webhooks" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

2. Filter deliveries by webhook ID:

```bash
curl -X GET "http://localhost:3000/api/v1/admin/webhooks/deliveries?webhookId=WEBHOOK_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test 4: Pagination

```bash
# Get first 10 deliveries
curl -X GET "http://localhost:3000/api/v1/admin/webhooks/deliveries?limit=10&offset=0" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get next 10 deliveries
curl -X GET "http://localhost:3000/api/v1/admin/webhooks/deliveries?limit=10&offset=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Test 5: Filter by Success Status

```bash
# Get only successful deliveries
curl -X GET "http://localhost:3000/api/v1/admin/webhooks/deliveries?success=true" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Get only failed deliveries
curl -X GET "http://localhost:3000/api/v1/admin/webhooks/deliveries?success=false" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Expected Response Format

### Successful Delivery Log Entry
```json
{
  "id": "uuid",
  "webhookId": "uuid",
  "event": "compliance.violated",
  "url": "https://webhook.site/...",
  "statusCode": 200,
  "success": true,
  "requestBody": "{\"event_type\":\"compliance.violated\",...}",
  "responseBody": "{\"status\":\"ok\"}",
  "error": null,
  "attemptedAt": "2026-02-08T01:35:37.000Z",
  "duration": 234,
  "webhook": {
    "id": "uuid",
    "organizationId": "uuid",
    "url": "https://webhook.site/...",
    "events": ["compliance.violated"],
    "active": true,
    "description": "Test webhook",
    "createdAt": "2026-02-08T00:00:00.000Z",
    "updatedAt": "2026-02-08T00:00:00.000Z"
  }
}
```

### Failed Delivery Log Entry
```json
{
  "id": "uuid",
  "webhookId": "uuid",
  "event": "compliance.violated",
  "url": "https://invalid-domain.com/webhook",
  "statusCode": null,
  "success": false,
  "requestBody": "{\"event_type\":\"compliance.violated\",...}",
  "responseBody": null,
  "error": "fetch failed",
  "attemptedAt": "2026-02-08T01:35:37.000Z",
  "duration": 10001
}
```

## Database Verification

You can also verify the data directly in PostgreSQL:

```sql
-- View all webhook deliveries
SELECT * FROM webhook_deliveries ORDER BY attempted_at DESC;

-- View failed deliveries
SELECT * FROM webhook_deliveries WHERE success = false;

-- View deliveries for a specific webhook
SELECT * FROM webhook_deliveries WHERE webhook_id = 'your-webhook-id';

-- Count deliveries by success status
SELECT success, COUNT(*) FROM webhook_deliveries GROUP BY success;
```

## Troubleshooting

### Migration Fails
If the migration fails, you may need to:
1. Check that the `webhooks` table exists
2. Verify database connection
3. Check for naming conflicts

### Prisma Client Errors
If you get "Unknown field" errors:
1. Regenerate Prisma client: `pnpm prisma generate`
2. Restart your dev server

### No Deliveries Logged
1. Verify webhooks are active
2. Check that compliance events are being fired
3. Review server logs for errors
4. Ensure the webhook URL in the database matches the deliverPayload call

## Next Steps

After successful testing:
1. Verify frontend integration (if applicable)
2. Test with real webhook endpoints
3. Monitor performance with large volumes of deliveries
4. Consider adding delivery retry logic (future enhancement)
5. Update Task #35 to completed status

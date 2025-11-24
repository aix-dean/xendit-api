# Xendit Payment Gateway API

A Node.js REST API that provides a secure interface to Xendit's payment services, supporting payments in Indonesia (IDR) and Philippines (PHP) with all best practices for payment gateway APIs.

## Features

- **Payment Requests**: Create, manage, and simulate payment requests
- **Payment Management**: Get status, cancel, and capture payments
- **Invoices**: Create payment links with full invoice management
- **Webhooks**: Secure webhook handling with verification
- **Security**: Basic Auth, rate limiting, CORS, input validation
- **Idempotency**: Prevent duplicate payment creation
- **Logging**: Comprehensive request/response logging
- **Error Handling**: Consistent error responses with proper HTTP codes

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Configure your environment variables in `.env`

5. Start the server:
   ```bash
   npm start
   ```

For development with auto-reload:
```bash
npm run dev
```

### Docker

```bash
docker-compose up --build
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `PORT` | Server port | No | 3000 |
| `NODE_ENV` | Environment | No | development |
| `XENDIT_API_KEY` | Your Xendit API key | Yes | - |
| `XENDIT_BASE_URL` | Xendit API base URL | No | https://api.xendit.co |
| `XENDIT_API_VERSION` | API version header | No | 2024-11-11 |
| `WEBHOOK_CALLBACK_TOKEN` | Webhook verification token | Yes | - |
| `FIREBASE_PROJECT_ID` | Firebase project ID | No | oh-app-bcf24 |
| `FIREBASE_SERVICE_ACCOUNT_KEY` | Firebase service account JSON | Yes (for Firestore) | - |
| `LOG_LEVEL` | Logging level | No | info |
| `RATE_LIMIT_WINDOW_MS` | Rate limit window | No | 900000 |
| `RATE_LIMIT_MAX_REQUESTS` | Max requests per window | No | 100 |
| `CORS_ORIGIN` | Allowed CORS origin | No | http://localhost:3000 |

## API Endpoints

**Note**: This API currently has no authentication enabled for simplicity. In production, consider adding authentication for security.

### Payment Requests

#### Create Payment Request
```http
POST /api/v1/payment-requests
Content-Type: application/json
Idempotency-Key: <uuid>

{
  "reference_id": "order-123",
  "type": "PAY",
  "country": "PH",
  "currency": "PHP",
  "channel_code": "PAYMAYA",
  "channel_properties": {
    "success_return_url": "https://your-app.com/payment/success",
    "failure_return_url": "https://your-app.com/payment/failed",
    "cancel_return_url": "https://your-app.com/payment/cancelled"
  },
  "request_amount": 500,
  "description": "Payment for order #123"
}
```

#### Get Payment Request Status
```http
GET /api/v1/payment-requests/{payment_request_id}
```

#### Cancel Payment Request
```http
POST /api/v1/payment-requests/{payment_request_id}/cancel
Content-Type: application/json
```

#### Simulate Payment (Test Mode)
```http
POST /api/v1/payment-requests/{payment_request_id}/simulate
Content-Type: application/json

{
  "amount": 10000
}
```

### Payments

#### Get Payment Status
```http
GET /api/v1/payments/{payment_id}
```

#### Cancel Payment
```http
POST /api/v1/payments/{payment_id}/cancel
Content-Type: application/json
```

#### Capture Payment
```http
POST /api/v1/payments/{payment_id}/capture
Content-Type: application/json

{
  "capture_amount": 10000
}
```

### Invoices

#### Create Invoice
```http
POST /api/v1/invoices
Content-Type: application/json
Idempotency-Key: <uuid>

{
  "external_id": "invoice-123",
  "amount": 50000,
  "description": "Invoice for services",
  "customer": {
    "email": "customer@example.com"
  }
}
```

#### Get Invoice
```http
GET /api/v1/invoices/{invoice_id}
```

#### Expire Invoice
```http
POST /api/v1/invoices/{invoice_id}/expire
Content-Type: application/json
```

#### List Invoices
```http
GET /api/v1/invoices?external_id=invoice-123&statuses=PENDING,PAID
```

### Webhooks

Webhooks are sent by Xendit to notify your application of payment events. The webhook endpoint processes and stores payment notifications, and automatically updates booking transaction status in Firestore.

#### Webhook Events
- `payment.capture` - Payment successfully completed (updates booking to "paid")
- `payment.authorization` - Payment authorized (for manual capture)
- `payment.failure` - Payment failed or was declined (updates booking to "failed")

#### Webhook Processing
When a webhook is received:
1. Verifies the `x-callback-token` header
2. Checks for idempotency using `webhook-id`
3. Updates the corresponding booking document in Firestore
4. Maps Xendit payment status to booking transaction status
5. Creates audit logs for tracking

#### Webhook Endpoint
```http
POST /api/v1/webhooks
x-callback-token: <your-webhook-token>
webhook-id: <unique-webhook-id>

{
  "event": "payment.capture",
  "business_id": "business-123",
  "created": "2024-01-01T00:00:00Z",
  "data": {
    "payment_id": "py-123",
    "payment_request_id": "pr-456",
    "status": "SUCCEEDED",
    "amount": 500,
    "currency": "PHP"
  }
}
```

#### Status Mapping
| Xendit Status | Booking Status | Description |
|---------------|----------------|-------------|
| `SUCCEEDED` | `paid` | Payment completed successfully |
| `FAILED` | `failed` | Payment failed or declined |
| `AUTHORIZED` | `authorized` | Payment authorized (manual capture) |
| `CANCELED` | `cancelled` | Payment was cancelled |
| `EXPIRED` | `expired` | Payment request expired |

#### Get Stored Webhooks
```http
GET /api/v1/webhooks
```

#### Get Specific Webhook
```http
GET /api/v1/webhooks/{webhook-id}
```

## Error Handling

All errors follow a consistent format:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request data",
    "details": [...]
  }
}
```

Common error codes:
- `VALIDATION_ERROR`: Invalid input data
- `NOT_FOUND`: Resource not found
- `INTERNAL_SERVER_ERROR`: Server error

## Security Features

- **Rate Limiting**: Configurable request limits per IP
- **Input Validation**: Comprehensive Joi validation for all endpoints
- **CORS**: Configurable cross-origin policies
- **Helmet**: Security headers and XSS protection
- **Idempotency**: Prevents duplicate payment operations
- **Webhook Verification**: Token-based webhook verification

**Note**: Authentication is currently disabled for development simplicity. Consider adding authentication (JWT, API keys, etc.) for production use.

**Important**: All payment creation endpoints require an `Idempotency-Key` header with a valid UUID (e.g., `123e4567-e89b-12d3-a456-426614174000`).

## Testing

### Unit Tests
Run unit tests:
```bash
npm test
```

Run with coverage:
```bash
npm run test:coverage
```

### API Testing
Test the API endpoints with curl commands:
```bash
npm run test:api
```

Or use the individual curl commands in `curl-tests.txt`:
```bash
# Copy and paste commands from curl-tests.txt
curl http://localhost:3001/health
```

## Health Check

Check API health:
```http
GET /health
```

Response:
```json
{
  "status": "OK",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456
}
```

## Monitoring

- Request/response logging with Winston
- Health checks for container orchestration
- Error tracking and alerting
- Performance monitoring

## Production Deployment

1. Set `NODE_ENV=production`
2. Use environment variables for all configuration
3. Enable HTTPS in your reverse proxy
4. Configure proper logging destinations
5. Set up monitoring and alerting
6. Use Redis for idempotency in multi-instance deployments

## License

MIT# xendit-api

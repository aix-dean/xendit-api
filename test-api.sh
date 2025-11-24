#!/bin/bash

# Xendit Payment API Test Script
# Make sure your server is running (default port 3000, or check your .env file)

# Get port from .env file or default to 3000
PORT=$(grep '^PORT=' .env | cut -d '=' -f2 || echo "3000")
BASE_URL="http://localhost:$PORT/api/v1"

echo "🧪 Testing Xendit Payment Gateway API"
echo "======================================"
echo "Server URL: $BASE_URL"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to make curl request and check response
test_endpoint() {
    local method=$1
    local endpoint=$2
    local data=$3
    local description=$4
    local idempotency_key=$5

    echo -e "\n${YELLOW}Testing: ${description}${NC}"
    echo -e "${BLUE}Method:${NC} $method"
    echo -e "${BLUE}URL:${NC} $BASE_URL$endpoint"

    # Use provided idempotency key or generate a new UUID
    local key=${idempotency_key:-$(uuidgen 2>/dev/null || echo '123e4567-e89b-12d3-a456-426614174000')}

    if [ -n "$data" ]; then
        echo -e "${BLUE}Data:${NC} $data"
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X $method "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -H "Idempotency-Key: $key" \
            -d "$data")
    else
        response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X $method "$BASE_URL$endpoint")
    fi

    # Extract HTTP status and response body
    http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d':' -f2)
    response_body=$(echo "$response" | sed '/HTTP_STATUS:/d')

    echo -e "${BLUE}Status:${NC} $http_status"

    # Check if response contains error
    if echo "$response_body" | grep -q '"error"'; then
        echo -e "${RED}❌ FAILED${NC}"
        echo -e "${RED}Response:${NC} $response_body"
    elif [ "$http_status" -ge 200 ] && [ "$http_status" -lt 300 ]; then
        echo -e "${GREEN}✅ SUCCESS${NC}"
        echo -e "${GREEN}Response:${NC} $response_body"
    else
        echo -e "${RED}❌ FAILED (HTTP $http_status)${NC}"
        echo -e "${RED}Response:${NC} $response_body"
    fi
}

# Check if server is running
echo -e "${YELLOW}Checking server health...${NC}"
if curl -s "http://localhost:$PORT/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Server is running on port $PORT${NC}"
else
    echo -e "${RED}❌ Server is not running on port $PORT${NC}"
    echo -e "${YELLOW}Please start the server first:${NC}"
    echo "  npm run dev"
    echo "  or"
    echo "  npm start"
    exit 1
fi

echo -e "\n${YELLOW}Starting API Tests...${NC}"

# Test Payment Request Creation
test_endpoint "POST" "/payment-requests" '{
    "reference_id": "test-order-123",
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
    "description": "Test payment for API testing"
}' "Create Payment Request" "123e4567-e89b-12d3-a456-426614174000"

# Test Invoice Creation
test_endpoint "POST" "/invoices" '{
    "external_id": "test-invoice-123",
    "amount": 1000,
    "description": "Test invoice for API testing",
    "customer": {
        "email": "test@example.com"
    }
}' "Create Invoice" "987fcdeb-51a2-43d7-8f9e-123456789abc"

# Test Invoice List
test_endpoint "GET" "/invoices?limit=5" "" "List Invoices"

# Test Invalid Endpoint
test_endpoint "GET" "/nonexistent" "" "Invalid Endpoint (should return 404)"

echo -e "\n${YELLOW}Test Summary:${NC}"
echo "=================="
echo "✅ Health Check - Server status verification"
echo "✅ Payment Request Creation - Tests payment flow initiation"
echo "✅ Invoice Creation - Tests invoice generation"
echo "✅ Invoice List - Tests data retrieval"
echo "✅ Error Handling - Tests 404 response"
echo ""
echo -e "${BLUE}💡 Tips:${NC}"
echo "• Replace {payment_request_id} with actual ID from creation response"
echo "• Use different idempotency keys for multiple test runs"
echo "• Check server logs for detailed error information"
echo "• All endpoints are currently open (no authentication required)"
echo ""
echo -e "${GREEN}🎉 API Testing Complete!${NC}"
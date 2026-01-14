#!/bin/bash

# Webhook Testing Script for Xendit Payment API
# This script sends test webhook payloads to your local API

BASE_URL="http://localhost:3000/api/v1"
WEBHOOK_TOKEN="KYLrHFV803ZpBqQK0W9fgMOifTtVBF6cqBzPyEuhnNRiQ75W"

echo "🔔 Testing Xendit Payment Webhooks"
echo "=================================="

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Function to send webhook
send_webhook() {
    local event=$1
    local status=$2
    local amount=$3
    local webhook_id=$4
    local description=$5

    echo -e "\n${YELLOW}Sending: ${description}${NC}"
    echo -e "${BLUE}Event:${NC} $event"
    echo -e "${BLUE}Status:${NC} $status"
    echo -e "${BLUE}Amount:${NC} $amount"

    response=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$BASE_URL/webhooks" \
        -H "Content-Type: application/json" \
        -H "x-callback-token: $WEBHOOK_TOKEN" \
        -H "webhook-id: $webhook_id" \
        -d "{
            \"event\": \"$event\",
            \"business_id\": \"test-business-123\",
            \"created\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",
            \"data\": {
                \"payment_id\": \"py-test-$(date +%s)\",
                \"reference_id\": \"order-test-$(date +%s)\",
                \"payment_request_id\": \"pr-test-$(date +%s)\",
                \"status\": \"$status\",
                \"amount\": $amount,
                \"currency\": \"PHP\",
                \"channel_code\": \"PAYMAYA\"
            }
        }")

    http_status=$(echo "$response" | grep "HTTP_STATUS:" | cut -d':' -f2)
    response_body=$(echo "$response" | sed '/HTTP_STATUS:/d')

    if [ "$http_status" = "200" ]; then
        echo -e "${GREEN}✅ Webhook accepted${NC}"
    else
        echo -e "${RED}❌ Webhook rejected (HTTP $http_status)${NC}"
        echo -e "${RED}Response: $response_body${NC}"
    fi
}

# Test different webhook scenarios
send_webhook "payment.capture" "SUCCEEDED" 500 "webhook-success-$(date +%s)" "Payment Success Webhook"
send_webhook "payment.failure" "FAILED" 500 "webhook-failure-$(date +%s)" "Payment Failure Webhook"
send_webhook "payment.authorization" "AUTHORIZED" 500 "webhook-auth-$(date +%s)" "Payment Authorization Webhook"

# Test duplicate webhook (should be accepted but marked as duplicate)
echo -e "\n${YELLOW}Testing duplicate webhook handling...${NC}"
send_webhook "payment.capture" "SUCCEEDED" 500 "webhook-success-$(date +%s)" "Duplicate Webhook Test"

# Get stored webhooks
echo -e "\n${YELLOW}Retrieving stored webhooks...${NC}"
webhooks_response=$(curl -s "$BASE_URL/webhooks")

if echo "$webhooks_response" | grep -q '"success":true'; then
    webhook_count=$(echo "$webhooks_response" | grep -o '"total":[0-9]*' | cut -d':' -f2)
    echo -e "${GREEN}✅ Retrieved $webhook_count stored webhooks${NC}"
else
    echo -e "${RED}❌ Failed to retrieve webhooks${NC}"
fi

echo -e "\n${BLUE}💡 Webhook Testing Complete!${NC}"
echo "Check your server logs for webhook processing details."
echo "Use the webhook viewer at: http://localhost:3000/api/v1/webhooks"
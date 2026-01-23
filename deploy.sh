#!/bin/bash

# Load environment variables from .env file if it exists
if [ -f ".env" ]; then
    echo "📄 Loading environment variables from .env file..."
    export $(grep -v '^#' .env | xargs)
fi

# Configuration
PROJECT_ID="oh-app-bcf24"
REPO_URL="asia-southeast1-docker.pkg.dev/$PROJECT_ID/xendit-api-repo"

echo "🚀 Deploying Xendit API to Cloud Run..."
echo "Project: $PROJECT_ID"
echo "Repository: $REPO_URL"
echo ""

# Check required environment variables
echo "🔍 Checking environment variables..."
if [ -z "$XENDIT_API_KEY" ]; then
    echo "❌ XENDIT_API_KEY is not set. Please run:"
    echo "   export XENDIT_API_KEY='your_xendit_api_key'"
    exit 1
fi

if [ -z "$WEBHOOK_CALLBACK_TOKEN" ] || [ "$WEBHOOK_CALLBACK_TOKEN" = "your_webhook_callback_token" ]; then
    echo "🔑 Generating secure webhook token..."
    WEBHOOK_CALLBACK_TOKEN=$(openssl rand -hex 32)
    echo "✅ Generated webhook token: $WEBHOOK_CALLBACK_TOKEN"
    echo "💡 Save this token for Xendit Dashboard configuration"
fi

if [ -z "$FIREBASE_SA_KEY" ]; then
    echo "❌ FIREBASE_SA_KEY is not set. Please run:"
    echo "   export FIREBASE_SA_KEY='your_firebase_service_account_json'"
    exit 1
fi

echo "✅ Environment variables are set"
echo ""

# Check gcloud authentication
echo "🔐 Checking gcloud authentication..."
gcloud auth list --filter=status:ACTIVE --format="value(account)" | head -1 > /dev/null
if [ $? -ne 0 ]; then
    echo "❌ Not authenticated with gcloud. Please run:"
    echo "   gcloud auth login"
    exit 1
fi

echo "✅ gcloud authentication confirmed"
echo ""

# Set project
echo "🔧 Setting project..."
gcloud config set project $PROJECT_ID

# Enable APIs
echo "📦 Enabling required APIs..."
gcloud services enable run.googleapis.com artifactregistry.googleapis.com

# Create repository
echo "🏗️ Creating Artifact Registry repository..."
gcloud artifacts repositories create xendit-api-repo \
  --repository-format=docker \
  --location=asia-southeast1 \
  --description="Docker repository for Xendit API" \
  --quiet 2>/dev/null || echo "Repository may already exist"

# Build and push
echo "🐳 Building and pushing Docker image..."
docker build --platform linux/amd64 -t $REPO_URL/xendit-api:latest .
gcloud auth configure-docker asia-southeast1-docker.pkg.dev
docker push $REPO_URL/xendit-api:latest

# Test login
echo "🔐 Testing Docker authentication..."
docker login asia-southeast1-docker.pkg.dev || echo "Login test completed"

# Check if image exists (with retry for eventual consistency)
echo "🔍 Verifying image..."
for i in {1..5}; do
    if gcloud artifacts docker images list $REPO_URL 2>/dev/null | grep -q "xendit-api"; then
        echo "✅ Image verified in registry"
        break
    fi
    if [ $i -eq 5 ]; then
        echo "❌ Image not found after 5 attempts. Build/push may have failed."
        exit 1
    fi
    echo "⏳ Waiting for image to be available (attempt $i/5)..."
    sleep 3
done

# Deploy
echo "🚀 Deploying to Cloud Run..."
gcloud run deploy xendit-api \
  --image $REPO_URL/xendit-api:latest \
  --platform managed \
  --region asia-southeast1 \
  --allow-unauthenticated \
  --port 8080 \
  --memory 1Gi \
  --cpu 1 \
  --max-instances 10 \
  --timeout 600 \
  --set-env-vars "NODE_ENV=production" \
  --set-env-vars "XENDIT_API_KEY=$XENDIT_API_KEY" \
  --set-env-vars "XENDIT_BASE_URL=https://api.xendit.co" \
  --set-env-vars "XENDIT_API_VERSION=2024-11-11" \
  --set-env-vars "WEBHOOK_CALLBACK_TOKEN=$WEBHOOK_CALLBACK_TOKEN" \
  --set-env-vars "FIREBASE_PROJECT_ID=$PROJECT_ID" \
  --set-env-vars "LOG_LEVEL=info" \
  --set-env-vars "RATE_LIMIT_WINDOW_MS=900000" \
  --set-env-vars "RATE_LIMIT_MAX_REQUESTS=100" \
  --set-env-vars "JWT_SECRET=$JWT_SECRET" \
  --set-env-vars "JWT_EXPIRES_IN=$JWT_EXPIRES_IN" \
  --set-env-vars "JWT_REFRESH_EXPIRES_IN=$JWT_REFRESH_EXPIRES_IN" \
  --set-env-vars "CORS_ORIGIN=*"

# Get service URL
SERVICE_URL=$(gcloud run services describe xendit-api --region=asia-southeast1 --format="value(status.url)" 2>/dev/null)
if [ $? -eq 0 ] && [ -n "$SERVICE_URL" ]; then
    echo ""
    echo "✅ Deployment complete!"
    echo "🌐 Service URL: $SERVICE_URL"
    echo ""
    echo "🧪 Test commands:"
    echo "curl $SERVICE_URL/health"
    echo ""
    echo "📋 Next steps:"
    echo "1. Set webhook URL in Xendit Dashboard: $SERVICE_URL/api/v1/webhooks"
    echo "2. Set webhook token in Xendit Dashboard: $WEBHOOK_CALLBACK_TOKEN"
    echo "3. Test with: ./test-webhook.sh"
    echo ""
    echo "🔧 Useful commands:"
    echo "# View logs:"
    echo "gcloud logging read \"resource.type=cloud_run_revision AND resource.labels.service_name=xendit-api\" --limit=10"
    echo ""
    echo "# Delete service:"
    echo "gcloud run services delete xendit-api --region=asia-southeast1"
else
    echo ""
    echo "❌ Deployment may have failed. Check the logs above."
    echo "To view detailed logs, run:"
    echo "gcloud logging read \"resource.type=cloud_run_revision\" --limit=20 --filter=\"resource.labels.service_name=xendit-api\""
    exit 1
fi

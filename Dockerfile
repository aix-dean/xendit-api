# Use Node.js LTS version
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy environment file and source code
COPY .env ./
COPY src/ ./src/

# Create non-root user
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nodejs -u 1001

# Create logs directory and set permissions
RUN mkdir -p logs && chown -R nodejs:nodejs /app
USER nodejs

# Expose port
EXPOSE 8080

# Health check (Cloud Run uses its own health checks, but this is useful for local Docker)
# Using PORT environment variable or defaulting to 8080
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:' + (process.env.PORT || 3000) + '/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) }).on('error', () => process.exit(1))"

# Start the application
CMD ["node", "src/server.js"]
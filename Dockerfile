# Use the latest LTS Node.js version with Alpine 3.22 for better security and performance
FROM node:20-alpine3.22

# Set environment variables
ENV NODE_ENV=production

# Create app directory and user for security
WORKDIR /app
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy package files first for better layer caching
COPY --chown=nodejs:nodejs package*.json ./

# Install dependencies with optimizations
RUN npm ci --only=production --no-audit --no-fund && \
    npm cache clean --force

# Copy application code
COPY --chown=nodejs:nodejs . .

# Create necessary directories and set permissions
RUN mkdir -p /app/logs && \
    chown -R nodejs:nodejs /app

# Switch to non-root user for security
USER nodejs

# Expose port
EXPOSE 3000

# Start the application
CMD ["node", "index.js"]
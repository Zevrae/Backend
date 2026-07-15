FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies first so this layer is cached unless package.json changes
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copy the rest of the application
COPY . .

ENV NODE_ENV=production
EXPOSE 5000

# Basic container-level health check against the app's /health endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||5000)+'/health', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]

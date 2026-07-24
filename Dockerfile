FROM node:20-alpine AS base
WORKDIR /app

# Install dependencies first so this layer is cached unless package.json changes
COPY package.json package-lock.json* ./
RUN npm ci --omit=dev --no-audit --no-fund

# Copy the rest of the application
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

# Health check against the app's /health endpoint on port 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3000)+'/health', r => process.exit(r.statusCode===200?0:1)).on('error', () => process.exit(1))"

CMD ["node", "server.js"]

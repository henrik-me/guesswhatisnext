# syntax=docker/dockerfile:1
FROM node:22-slim
WORKDIR /app

# Install production dependencies (better-sqlite3 has prebuilt binaries)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy application code
COPY server/ ./server/
COPY public/ ./public/

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production
CMD ["node", "server/index.js"]

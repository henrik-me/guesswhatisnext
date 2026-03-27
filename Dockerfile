# syntax=docker/dockerfile:1
FROM node:18-alpine AS build
WORKDIR /app

# Install build tools for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Install dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# --- Production stage (no build tools) ---
FROM node:18-alpine
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY package*.json ./
COPY server/ ./server/
COPY public/ ./public/

# Create data directory for SQLite
RUN mkdir -p /app/data

EXPOSE 3000

ENV NODE_ENV=production
CMD ["node", "server/index.js"]

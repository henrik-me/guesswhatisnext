# syntax=docker/dockerfile:1
FROM node:22-slim
WORKDIR /app

# Install production dependencies (better-sqlite3 has prebuilt binaries)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy build scripts and templates needed for sw.js generation
COPY scripts/build-sw.js ./scripts/
COPY public/ ./public/

# Generate content-hashed sw.js so production images always have a fresh cache name
RUN node scripts/build-sw.js

# Copy application code
COPY server/ ./server/

EXPOSE 3000

ENV NODE_ENV=production
CMD ["node", "server/index.js"]

# syntax=docker/dockerfile:1
FROM node:22-slim
WORKDIR /app

# CS77: set NODE_ENV=production BEFORE `npm ci` so the husky `prepare`
# script (`.husky/install.mjs`) — which is not yet copied into the image
# — short-circuits via its NODE_ENV=production guard. Without this the
# prepare script would try to load a missing file. Final ENV line below
# is kept for runtime intent; this earlier setting only needs to cover
# the install step.
ENV NODE_ENV=production

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

# NODE_ENV already set near the top (CS77) so it persists at runtime too.
CMD ["node", "server/index.js"]

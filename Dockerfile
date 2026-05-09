# syntax=docker/dockerfile:1
FROM node:22-slim
WORKDIR /app

# CS77: set NODE_ENV=production BEFORE `npm ci` so the husky `prepare`
# script (`.husky/install.mjs`) short-circuits via its NODE_ENV guard.
# We also COPY the shim itself so `node .husky/install.mjs` can at
# least *load* — without the file present, npm's `prepare` lifecycle
# would fail with ERR_MODULE_NOT_FOUND before our env guard could
# run. Belt-and-braces: the env-guard makes the shim a no-op even if
# husky is absent (which it is, since we use `--omit=dev`).
ENV NODE_ENV=production

# Install production dependencies (better-sqlite3 has prebuilt binaries)
COPY package.json package-lock.json ./
COPY .husky/install.mjs ./.husky/install.mjs
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

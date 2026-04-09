#!/usr/bin/env node
/**
 * Local HTTPS dev server with self-signed certificate.
 *
 * Starts two listeners:
 *   - HTTPS on port 3443 (self-signed cert, generated on the fly)
 *   - HTTP  on port 3080 → 308 redirect to HTTPS (handled directly,
 *     independent of NODE_ENV).
 *
 * Usage:
 *   node scripts/dev-https.js
 *
 * Then open https://localhost:3443 in your browser (accept the self-signed warning).
 * Or hit  http://localhost:3080  to see the 308 redirect to https://localhost:3443.
 */

const https = require('https');
const http = require('http');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const HTTPS_PORT = parseInt(process.env.HTTPS_PORT, 10) || 3443;
const HTTP_PORT = parseInt(process.env.HTTP_PORT, 10) || 3080;
const HOST = `localhost:${HTTPS_PORT}`;

// ---------- Generate a self-signed certificate on the fly ----------
function generateSelfSignedCert() {
  const certDir = path.join(__dirname, '..', 'data');
  const keyPath = path.join(certDir, 'dev-key.pem');
  const certPath = path.join(certDir, 'dev-cert.pem');

  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    console.log('♻️  Reusing existing self-signed cert in data/');
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath),
    };
  }

  console.log('🔐 Generating self-signed certificate…');
  fs.mkdirSync(certDir, { recursive: true });

  const opensslCmd =
    `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" ` +
    `-days 365 -nodes -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`;

  try {
    execSync(opensslCmd, { stdio: 'pipe' });
  } catch (err) {
    const baseMessage =
      'Failed to run "openssl" to generate the development HTTPS certificate.';
    const sysDetail = err.stderr ? err.stderr.toString().trim() : err.message;

    // On Windows, try Git for Windows' bundled openssl as a fallback.
    if (process.platform === 'win32') {
      const gitOpenssl = 'C:\\Program Files\\Git\\usr\\bin\\openssl.exe';
      if (fs.existsSync(gitOpenssl)) {
        try {
          execSync(
            `"${gitOpenssl}" req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" ` +
            `-days 365 -nodes -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`,
            { stdio: 'pipe' }
          );
          console.log('✅ Certificate written to data/dev-key.pem + data/dev-cert.pem');
          return {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath),
          };
        } catch (gitErr) {
          const gitDetail = gitErr.stderr ? gitErr.stderr.toString().trim() : gitErr.message;
          throw new Error(
            `${baseMessage}\n` +
            'Both system "openssl" and Git for Windows bundled "openssl" failed.\n' +
            `System error: ${sysDetail}\n` +
            `Git error: ${gitDetail}`
          );
        }
      }
    }

    throw new Error(
      `${baseMessage}\n` +
      `Underlying error: ${sysDetail}\n\n` +
      'Install OpenSSL and ensure "openssl" is available on your PATH.\n' +
      '  macOS:   brew install openssl\n' +
      '  Linux:   sudo apt-get install openssl\n' +
      '  Windows: install Git for Windows (with Unix tools)'
    );
  }

  console.log('✅ Certificate written to data/dev-key.pem + data/dev-cert.pem');
  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath),
  };
}

// ---------- Set environment for development with HTTPS ----------
// Force NODE_ENV=development so dev features work (pretty logs, feature flag
// overrides, etc.) even if the caller has a different NODE_ENV set.
// Security headers (helmet) apply regardless of NODE_ENV.
// The HTTP→HTTPS redirect is handled directly by the HTTP server below,
// not by the production-only httpsRedirect middleware.
process.env.NODE_ENV = 'development';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev-https-test-secret';
process.env.SYSTEM_API_KEY = process.env.SYSTEM_API_KEY || 'dev-https-test-key';
process.env.CANONICAL_HOST = HOST;

// Use a dedicated dev-https database by default so we do not mutate the
// normal development DB when running with production-like settings.
if (!process.env.GWN_DB_PATH) {
  const devHttpsDbPath = path.join(__dirname, '..', 'data', 'game-dev-https.db');
  process.env.GWN_DB_PATH = devHttpsDbPath;
  console.warn(`[dev-https] Using dedicated dev database at ${devHttpsDbPath}`);
}

// Align config.PORT with HTTPS_PORT so modules that read it get the right value.
process.env.PORT = String(HTTPS_PORT);

const { config, validateConfig } = require('../server/config');
config.CANONICAL_HOST = HOST;

validateConfig();

const tls = generateSelfSignedCert();

// Monkey-patch http.createServer so that createServer() builds an HTTPS
// server transparently (WebSocket upgrade, routes, everything wired up).
const origCreateServer = http.createServer;
http.createServer = function patchedCreateServer(...args) {
  const listener = typeof args[0] === 'function' ? args[0] : args[1];
  const httpsServer = https.createServer(tls, listener);
  http.createServer = origCreateServer;
  return httpsServer;
};

const { createServer } = require('../server/app');
const { app, server } = createServer();

server.listen(HTTPS_PORT, '127.0.0.1', () => {
  console.log(`\n🔒 HTTPS server: https://localhost:${HTTPS_PORT}`);
  console.log(`   Security headers, CSP, and WebSocket (wss://) are active.`);
});

// HTTP server — redirects to HTTPS directly (independent of NODE_ENV).
const httpServer = http.createServer((req, res) => {
  const location = `https://localhost:${HTTPS_PORT}${req.url}`;
  res.writeHead(308, { Location: location });
  res.end();
});

httpServer.listen(HTTP_PORT, '127.0.0.1', () => {
  console.log(`🌐 HTTP  server: http://localhost:${HTTP_PORT}`);
  console.log(`   Requests here will get a 308 redirect to HTTPS.\n`);
});

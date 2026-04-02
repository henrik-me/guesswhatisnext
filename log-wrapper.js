const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logPath = path.join(__dirname, 'telemetry.log');
const logStream = fs.createWriteStream(logPath, { flags: 'w' });

const child = spawn('node', ['server/index.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'development',
    LOG_LEVEL: 'debug',
    PORT: '3000',
    JWT_SECRET: 'dev-jwt-secret',
    SYSTEM_API_KEY: 'gwn-dev-system-key',
  },
  cwd: __dirname,
  stdio: ['inherit', 'pipe', 'pipe'],
});

child.stdout.on('data', (d) => { process.stdout.write(d); logStream.write(d); });
child.stderr.on('data', (d) => { process.stderr.write(d); logStream.write(d); });
child.on('exit', (code) => { logStream.end(); process.exit(code || 0); });
process.on('SIGINT', () => child.kill('SIGINT'));
process.on('SIGTERM', () => child.kill('SIGTERM'));

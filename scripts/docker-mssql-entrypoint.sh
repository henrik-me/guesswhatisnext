#!/bin/sh
# Docker entrypoint: wait for MSSQL, create DB if needed, then start app.
# Used by docker-compose.mssql.yml to ensure the gwn database exists.

set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL not set — starting with SQLite"
  exec node server/index.js
fi

echo "Waiting for SQL Server to accept connections..."

# Extract password from DATABASE_URL for sqlcmd
# DATABASE_URL format: Server=host,port;Database=db;User Id=sa;Password=xxx;...
MSSQL_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*Server=\([^;]*\).*/\1/p')
MSSQL_DB=$(echo "$DATABASE_URL" | sed -n 's/.*Database=\([^;]*\).*/\1/p')

# Use node to create the database — avoids needing sqlcmd in the container
node -e "
const sql = require('mssql');
const connStr = process.env.DATABASE_URL.replace(/Database=[^;]+/, 'Database=master');
const dbName = '${MSSQL_DB}';

async function init() {
  const maxAttempts = 15;
  let pool;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      pool = await sql.connect(connStr);
      break;
    } catch (err) {
      if (i === maxAttempts) { console.error('Could not connect to SQL Server:', err.message); process.exit(1); }
      console.log('Attempt ' + i + '/' + maxAttempts + ' — waiting for SQL Server...');
      await new Promise(r => setTimeout(r, i * 1000));
    }
  }
  try {
    await pool.request().query(\"IF DB_ID('\" + dbName + \"') IS NULL CREATE DATABASE [\" + dbName + \"]\");
    console.log('Database ' + dbName + ' is ready.');
  } finally {
    await pool.close();
  }
}
init().catch(err => { console.error(err); process.exit(1); });
"

echo "Starting application..."
exec node server/index.js

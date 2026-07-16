const { Pool } = require('pg');

// PandaStack injects DATABASE_URL automatically when a managed Postgres
// database is attached to this app in the dashboard.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost')
    ? false
    : { rejectUnauthorized: false }
});

pool.on('error', (err) => {
  console.error('Unexpected Postgres pool error', err);
});

module.exports = { pool };

const { Pool } = require('pg');

// Render injects DATABASE_URL automatically when a Postgres database is
// linked to this service (either via render.yaml Blueprint, or by pasting
// the "Internal Database URL" into this service's environment variables).
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

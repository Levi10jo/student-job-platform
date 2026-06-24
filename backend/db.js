'use strict';

// ---------------------------------------------------------------------------
// Database layer: a single MySQL connection pool shared across the app.
// ---------------------------------------------------------------------------
// We use the mysql2 Promise API so route handlers can use async/await and
// prepared statements (pool.execute) for safe, parameterised queries.

const path = require('path');

// db.js lives in backend/, the .env file lives one level up in the project root.
// Loading it here makes the pool usable both via server.js and standalone (tests).
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');

// A pool reuses a fixed set of connections instead of opening a new one per
// request, which keeps the app fast and avoids exhausting MySQL's connections.
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'studywork',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'studywork',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
});

/**
 * Verifies the database is reachable. Called once on server startup so the app
 * fails fast with a clear message instead of erroring on the first request.
 * @returns {Promise<void>}
 */
async function testConnection() {
  const conn = await pool.getConnection();
  try {
    await conn.ping();
  } finally {
    conn.release();
  }
}

module.exports = { pool, testConnection };

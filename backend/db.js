'use strict';


const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const mysql = require('mysql2/promise');

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

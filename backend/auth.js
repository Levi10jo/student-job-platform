'use strict';

// ---------------------------------------------------------------------------
// Auth service: password hashing + session management. Implemented with the
// Node.js built-in crypto module only (no external auth provider, per spec).
//
// Passwords:  scrypt with a random 16-byte salt, stored as "scrypt:salt:hash"
//             (hex). scrypt is deliberately slow, which protects the hashes
//             against brute-force attacks if the database ever leaks.
// Sessions:   random 32-byte token in an HttpOnly cookie, mapped to the user
//             in an in-memory store. Sessions therefore end when the server
//             restarts – an accepted and documented MVP simplification.
// ---------------------------------------------------------------------------

const crypto = require('crypto');

const SESSION_COOKIE = 'sw_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const SCRYPT_KEYLEN = 64;

/* --- Password hashing ------------------------------------------------------ */

// Promisified scrypt so the hashing never blocks the event loop callback-style.
function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

/** Hashes a plaintext password into the storable "scrypt:salt:hash" format. */
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt);
  return `scrypt:${salt}:${key.toString('hex')}`;
}

/** Constant-time check of a plaintext password against a stored hash. */
async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, hashHex] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hashHex) return false;
  const key = await scryptAsync(password, salt);
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== key.length) return false;
  // timingSafeEqual prevents timing attacks on the comparison.
  return crypto.timingSafeEqual(key, expected);
}

/* --- Session store ---------------------------------------------------------- */

// token -> { user: { role, id, name, email }, expiresAt }
const sessions = new Map();

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { user, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

function getSession(token) {
  if (!token) return null;
  const entry = sessions.get(token);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return entry.user;
}

function destroySession(token) {
  if (token) sessions.delete(token);
}

/**
 * Keeps active sessions consistent with the database: updates name/email of
 * all sessions of a user, or removes the sessions entirely (on delete).
 */
function syncSessions(role, id, fields) {
  for (const [token, entry] of sessions) {
    if (entry.user.role !== role || entry.user.id !== id) continue;
    if (fields === null) sessions.delete(token);
    else Object.assign(entry.user, fields);
  }
}

/* --- Cookie handling --------------------------------------------------------- */

// Minimal cookie parser – we only ever need our own session cookie.
function readSessionToken(req) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

function setSessionCookie(res, token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

/* --- Request helpers / middleware --------------------------------------------- */

/** Returns the logged-in user ({ role, id, name, email }) or null. */
function getAuthUser(req) {
  return getSession(readSessionToken(req));
}

/**
 * Express middleware: only lets logged-in companies pass and exposes the
 * session user as req.company. Used to protect all company-only endpoints.
 */
function requireCompany(req, res, next) {
  const user = getAuthUser(req);
  if (!user || user.role !== 'company') {
    return res
      .status(401)
      .json({ success: false, error: 'Bitte melde dich als Unternehmen an.' });
  }
  req.company = user;
  return next();
}

/**
 * Express middleware: only lets logged-in students pass and exposes the
 * session user as req.student. Used to protect the student profile endpoints.
 */
function requireStudent(req, res, next) {
  const user = getAuthUser(req);
  if (!user || user.role !== 'student') {
    return res
      .status(401)
      .json({ success: false, error: 'Bitte melde dich als Student an.' });
  }
  req.student = user;
  return next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  syncSessions,
  readSessionToken,
  setSessionCookie,
  clearSessionCookie,
  getAuthUser,
  requireCompany,
  requireStudent,
};

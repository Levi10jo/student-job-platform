'use strict';


const crypto = require('crypto');

const SESSION_COOKIE = 'sw_session';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 Tage
const SCRYPT_KEYLEN = 64;

/* --- Password hashing ------------------------------------------------------ */

function scryptAsync(password, salt) {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}


async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scryptAsync(password, salt);
  return `scrypt:${salt}:${key.toString('hex')}`;
}


async function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [scheme, salt, hashHex] = stored.split(':');
  if (scheme !== 'scrypt' || !salt || !hashHex) return false;
  const key = await scryptAsync(password, salt);
  const expected = Buffer.from(hashHex, 'hex');
  if (expected.length !== key.length) return false;
  return crypto.timingSafeEqual(key, expected);
}

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

function syncSessions(role, id, fields) {
  for (const [token, entry] of sessions) {
    if (entry.user.role !== role || entry.user.id !== id) continue;
    if (fields === null) sessions.delete(token);
    else Object.assign(entry.user, fields);
  }
}

/* --- Cookie handling --------------------------------------------------------- */

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

function getAuthUser(req) {
  return getSession(readSessionToken(req));
}

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

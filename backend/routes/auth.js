'use strict';


const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const {
  sendSuccess,
  sendError,
  sendServerError,
  isNonEmptyString,
  isValidEmail,
  isTooLong,
} = require('../helpers');
const {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  readSessionToken,
  setSessionCookie,
  clearSessionCookie,
  getAuthUser,
} = require('../auth');

const ROLES = ['student', 'company'];
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 100;
const MAX = { name: 100, email: 100, description: 2000, website: 255 };

function publicUser(role, row) {
  return { role, id: row.id, name: row.name, email: row.email };
}

async function emailExists(table, email) {
  const [rows] = await pool.execute(`SELECT id FROM ${table} WHERE email = ?`, [email]);
  return rows.length > 0;
}

/**
 * @swagger
 * /api/v1/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Konto anlegen (Student oder Unternehmen) und direkt einloggen
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role, name, email, password]
 *             properties:
 *               role: { type: string, enum: [student, company], example: "student" }
 *               name: { type: string, example: "Lena Hofmann" }
 *               email: { type: string, example: "lena@uni.de" }
 *               password: { type: string, example: "studywork123" }
 *               description: { type: string, description: "nur für Unternehmen (optional)" }
 *               website: { type: string, description: "nur für Unternehmen (optional)" }
 *     responses:
 *       201:
 *         description: Konto erstellt und eingeloggt (Session-Cookie gesetzt)
 *       400:
 *         description: Fehlerhafte Eingabe oder E-Mail bereits registriert
 */
// POST /api/v1/auth/register – create a student or company account + log in.
router.post('/register', async (req, res) => {
  try {
    const { role, name, email, password, description, website } = req.body || {};

    const errors = [];
    if (!ROLES.includes(role)) errors.push('role muss "student" oder "company" sein.');
    if (!isNonEmptyString(name)) errors.push('name ist erforderlich.');
    else if (isTooLong(name, MAX.name)) errors.push(`name darf höchstens ${MAX.name} Zeichen lang sein.`);
    if (!isValidEmail(email)) errors.push('email muss eine gültige E-Mail-Adresse sein.');
    else if (isTooLong(email, MAX.email)) errors.push(`email darf höchstens ${MAX.email} Zeichen lang sein.`);
    if (typeof password !== 'string' || password.length < PASSWORD_MIN_LENGTH) {
      errors.push(`password muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`);
    } else if (password.length > PASSWORD_MAX_LENGTH) {
      errors.push(`password darf höchstens ${PASSWORD_MAX_LENGTH} Zeichen lang sein.`);
    }
    if (isTooLong(description, MAX.description)) errors.push(`description darf höchstens ${MAX.description} Zeichen lang sein.`);
    if (isTooLong(website, MAX.website)) errors.push(`website darf höchstens ${MAX.website} Zeichen lang sein.`);
    if (errors.length) {
      return sendError(res, 400, errors.join(' '));
    }

    const table = role === 'student' ? 'students' : 'companies';
    const cleanEmail = email.trim();
    if (await emailExists(table, cleanEmail)) {
      return sendError(res, 400, 'Diese E-Mail-Adresse ist bereits registriert.');
    }

    const passwordHash = await hashPassword(password);
    let result;
    if (role === 'student') {
      [result] = await pool.execute(
        'INSERT INTO students (name, email, password_hash) VALUES (?, ?, ?)',
        [name.trim(), cleanEmail, passwordHash]
      );
    } else {
      [result] = await pool.execute(
        'INSERT INTO companies (name, email, password_hash, description, website) VALUES (?, ?, ?, ?, ?)',
        [
          name.trim(),
          cleanEmail,
          passwordHash,
          isNonEmptyString(description) ? description.trim() : null,
          isNonEmptyString(website) ? website.trim() : null,
        ]
      );
    }

    const user = publicUser(role, { id: result.insertId, name: name.trim(), email: cleanEmail });
    setSessionCookie(res, createSession(user));
    return sendSuccess(res, 201, user);
  } catch (err) {
    return sendServerError(res, err, 'POST /auth/register');
  }
});

/**
 * @swagger
 * /api/v1/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Anmelden (Student oder Unternehmen)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [role, email, password]
 *             properties:
 *               role: { type: string, enum: [student, company], example: "company" }
 *               email: { type: string, example: "kontakt@technova.de" }
 *               password: { type: string, example: "studywork123" }
 *     responses:
 *       200:
 *         description: Erfolgreich angemeldet (Session-Cookie gesetzt)
 *       400:
 *         description: Eingabe unvollständig
 *       401:
 *         description: E-Mail-Adresse oder Passwort ist falsch
 */
// POST /api/v1/auth/login – verify credentials and start a session.
router.post('/login', async (req, res) => {
  try {
    const { role, email, password } = req.body || {};

    if (!ROLES.includes(role) || !isValidEmail(email) || !isNonEmptyString(password)) {
      return sendError(res, 400, 'Bitte Rolle, E-Mail-Adresse und Passwort angeben.');
    }
    if (password.length > PASSWORD_MAX_LENGTH) {
      return sendError(res, 401, 'E-Mail-Adresse oder Passwort ist falsch.');
    }

    const table = role === 'student' ? 'students' : 'companies';
    const [rows] = await pool.execute(
      `SELECT id, name, email, password_hash FROM ${table} WHERE email = ?`,
      [email.trim()]
    );

    const row = rows[0];
    const valid = row && (await verifyPassword(password, row.password_hash));
    if (!valid) {
      return sendError(res, 401, 'E-Mail-Adresse oder Passwort ist falsch.');
    }

    const user = publicUser(role, row);
    setSessionCookie(res, createSession(user));
    return sendSuccess(res, 200, user);
  } catch (err) {
    return sendServerError(res, err, 'POST /auth/login');
  }
});

// POST /api/v1/auth/logout – end the current session (idempotent).
/**
 * @swagger
 * /api/v1/auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Abmelden (Session beenden, Cookie löschen)
 *     responses:
 *       200: { description: Erfolgreich abgemeldet }
 */
router.post('/logout', (req, res) => {
  try {
    destroySession(readSessionToken(req));
    clearSessionCookie(res);
    return sendSuccess(res, 200, { loggedOut: true });
  } catch (err) {
    return sendServerError(res, err, 'POST /auth/logout');
  }
});

// GET /api/v1/auth/me – current user, or null when not logged in.
/**
 * @swagger
 * /api/v1/auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Aktuell eingeloggten Nutzer abrufen
 *     responses:
 *       200: { description: "Nutzerobjekt (role, id, name, email) oder null" }
 */
router.get('/me', (req, res) => {
  try {
    return sendSuccess(res, 200, getAuthUser(req));
  } catch (err) {
    return sendServerError(res, err, 'GET /auth/me');
  }
});

module.exports = router;

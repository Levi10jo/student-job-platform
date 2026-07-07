'use strict';

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireCompany, syncSessions } = require('../auth');
const {
  sendSuccess,
  sendError,
  sendServerError,
  isNonEmptyString,
  isValidEmail,
  isPositiveInt,
  isTooLong,
} = require('../helpers');

const PUBLIC_COLUMNS = 'id, name, email, description, website, created_at';

const MAX = { name: 100, email: 100, description: 2000, website: 255 };

function lengthErrors({ name, email, description, website }) {
  const errors = [];
  if (isTooLong(name, MAX.name)) errors.push(`name darf höchstens ${MAX.name} Zeichen lang sein.`);
  if (isTooLong(email, MAX.email)) errors.push(`email darf höchstens ${MAX.email} Zeichen lang sein.`);
  if (isTooLong(description, MAX.description)) errors.push(`description darf höchstens ${MAX.description} Zeichen lang sein.`);
  if (isTooLong(website, MAX.website)) errors.push(`website darf höchstens ${MAX.website} Zeichen lang sein.`);
  return errors;
}

async function fetchCompanyById(id) {
  const [rows] = await pool.execute(
    `SELECT ${PUBLIC_COLUMNS} FROM companies WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

async function emailTaken(email, exceptId = null) {
  const [rows] = exceptId
    ? await pool.execute('SELECT id FROM companies WHERE email = ? AND id != ?', [email, exceptId])
    : await pool.execute('SELECT id FROM companies WHERE email = ?', [email]);
  return rows.length > 0;
}

/**
 * @swagger
 * /api/v1/companies:
 *   get:
 *     tags: [Unternehmen]
 *     summary: Alle Unternehmen abrufen
 *     responses:
 *       200:
 *         description: Liste aller Unternehmen (ohne Passwort-Hash)
 *       500:
 *         description: Interner Serverfehler
 */
// GET /api/v1/companies
router.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(`SELECT ${PUBLIC_COLUMNS} FROM companies ORDER BY name ASC`);
    return sendSuccess(res, 200, rows);
  } catch (err) {
    return sendServerError(res, err, 'GET /companies');
  }
});

// GET /api/v1/companies/:id
/**
 * @swagger
 * /api/v1/companies/{id}:
 *   get:
 *     tags: [Unternehmen]
 *     summary: Einzelnes Unternehmen abrufen
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Das Unternehmen (ohne Passwort-Hash) }
 *       404: { description: Unternehmen nicht gefunden }
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return sendError(res, 400, 'Ungültige Unternehmens-ID.');
    }
    const company = await fetchCompanyById(id);
    if (!company) {
      return sendError(res, 404, 'Unternehmen nicht gefunden.');
    }
    return sendSuccess(res, 200, company);
  } catch (err) {
    return sendServerError(res, err, 'GET /companies/:id');
  }
});

/**
 * @swagger
 * /api/v1/companies:
 *   post:
 *     tags: [Unternehmen]
 *     summary: Unternehmen anlegen
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email]
 *             properties:
 *               name: { type: string, example: "TechNova GmbH" }
 *               email: { type: string, example: "kontakt@technova.de" }
 *               description: { type: string, example: "Softwarehaus aus Berlin." }
 *               website: { type: string, example: "https://technova.example" }
 *     responses:
 *       201:
 *         description: Unternehmen angelegt
 *       400:
 *         description: Fehlerhafte Eingabe oder E-Mail bereits vergeben
 */
// POST /api/v1/companies – register a company.
router.post('/', async (req, res) => {
  try {
    const { name, email, description, website } = req.body || {};

    const errors = [];
    if (!isNonEmptyString(name)) errors.push('name ist erforderlich.');
    if (!isValidEmail(email)) errors.push('email muss eine gültige E-Mail-Adresse sein.');
    errors.push(...lengthErrors(req.body || {}));
    if (errors.length) {
      return sendError(res, 400, errors.join(' '));
    }

    if (await emailTaken(email.trim())) {
      return sendError(res, 400, 'Diese E-Mail-Adresse ist bereits registriert.');
    }

    const [result] = await pool.execute(
      `INSERT INTO companies (name, email, description, website)
       VALUES (?, ?, ?, ?)`,
      [
        name.trim(),
        email.trim(),
        isNonEmptyString(description) ? description.trim() : null,
        isNonEmptyString(website) ? website.trim() : null,
      ]
    );
    const created = await fetchCompanyById(result.insertId);
    return sendSuccess(res, 201, created);
  } catch (err) {
    return sendServerError(res, err, 'POST /companies');
  }
});

// PUT /api/v1/companies/:id – full update (name + email required).
// A company can only edit its own profile.
/**
 * @swagger
 * /api/v1/companies/{id}:
 *   put:
 *     tags: [Unternehmen]
 *     summary: Eigenes Unternehmensprofil aktualisieren (Unternehmen-Login)
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email]
 *             properties:
 *               name: { type: string }
 *               email: { type: string }
 *               description: { type: string }
 *               website: { type: string }
 *     responses:
 *       200: { description: Aktualisiertes Unternehmen }
 *       400: { description: Fehlerhafte Eingabe }
 *       401: { description: Nicht angemeldet }
 *       403: { description: Nur das eigene Profil bearbeitbar }
 *       404: { description: Unternehmen nicht gefunden }
 */
router.put('/:id', requireCompany, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return sendError(res, 400, 'Ungültige Unternehmens-ID.');
    }
    if (Number(id) !== req.company.id) {
      return sendError(res, 403, 'Du kannst nur dein eigenes Unternehmensprofil bearbeiten.');
    }
    if (!(await fetchCompanyById(id))) {
      return sendError(res, 404, 'Unternehmen nicht gefunden.');
    }

    const { name, email, description, website } = req.body || {};
    const errors = [];
    if (!isNonEmptyString(name)) errors.push('name ist erforderlich.');
    if (!isValidEmail(email)) errors.push('email muss eine gültige E-Mail-Adresse sein.');
    errors.push(...lengthErrors(req.body || {}));
    if (errors.length) {
      return sendError(res, 400, errors.join(' '));
    }

    if (await emailTaken(email.trim(), Number(id))) {
      return sendError(res, 400, 'Diese E-Mail-Adresse ist bereits von einem anderen Unternehmen vergeben.');
    }

    await pool.execute(
      `UPDATE companies SET name = ?, email = ?, description = ?, website = ? WHERE id = ?`,
      [
        name.trim(),
        email.trim(),
        isNonEmptyString(description) ? description.trim() : null,
        isNonEmptyString(website) ? website.trim() : null,
        id,
      ]
    );
    const updated = await fetchCompanyById(id);
    // Keep the active login sessions in sync with the changed profile.
    syncSessions('company', Number(id), { name: updated.name, email: updated.email });
    return sendSuccess(res, 200, updated);
  } catch (err) {
    return sendServerError(res, err, 'PUT /companies/:id');
  }
});

// DELETE /api/v1/companies/:id  (cascades to jobs + applications)
// A company can only delete its own account.
/**
 * @swagger
 * /api/v1/companies/{id}:
 *   delete:
 *     tags: [Unternehmen]
 *     summary: Eigenes Unternehmen löschen (inkl. Jobs & Bewerbungen)
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Unternehmen gelöscht }
 *       401: { description: Nicht angemeldet }
 *       403: { description: Nur das eigene Konto löschbar }
 *       404: { description: Unternehmen nicht gefunden }
 */
router.delete('/:id', requireCompany, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return sendError(res, 400, 'Ungültige Unternehmens-ID.');
    }
    if (Number(id) !== req.company.id) {
      return sendError(res, 403, 'Du kannst nur dein eigenes Unternehmen löschen.');
    }
    const [result] = await pool.execute('DELETE FROM companies WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return sendError(res, 404, 'Unternehmen nicht gefunden.');
    }
    // The account is gone – terminate all of its login sessions as well.
    syncSessions('company', Number(id), null);
    return sendSuccess(res, 200, { id: Number(id), deleted: true });
  } catch (err) {
    return sendServerError(res, err, 'DELETE /companies/:id');
  }
});

module.exports = router;

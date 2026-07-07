'use strict';

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireCompany } = require('../auth');
const {
  sendSuccess,
  sendError,
  sendServerError,
  isNonEmptyString,
  isPositiveInt,
  isTooLong,
} = require('../helpers');

const JOB_TYPES = ['Teilzeit', 'Vollzeit', 'Werkstudent', 'Praktikum', 'Minijob'];
const JOB_STATUSES = ['aktiv', 'pausiert', 'geschlossen'];

const MAX = { title: 150, description: 5000, location: 100, salary_range: 50 };

function lengthErrors({ title, description, location, salary_range }) {
  const errors = [];
  if (isTooLong(title, MAX.title)) errors.push(`title darf höchstens ${MAX.title} Zeichen lang sein.`);
  if (isTooLong(description, MAX.description)) errors.push(`description darf höchstens ${MAX.description} Zeichen lang sein.`);
  if (isTooLong(location, MAX.location)) errors.push(`location darf höchstens ${MAX.location} Zeichen lang sein.`);
  if (isTooLong(salary_range, MAX.salary_range)) errors.push(`salary_range darf höchstens ${MAX.salary_range} Zeichen lang sein.`);
  return errors;
}

async function fetchJobById(id) {
  const [rows] = await pool.execute(
    `SELECT j.*, c.name AS company_name
     FROM jobs j
     JOIN companies c ON c.id = j.company_id
     WHERE j.id = ?`,
    [id]
  );
  return rows[0] || null;
}

/**
 * @swagger
 * /api/v1/jobs:
 *   get:
 *     tags: [Jobs]
 *     summary: Alle Stellenanzeigen abrufen (mit optionalen Filtern)
 *     parameters:
 *       - in: query
 *         name: title
 *         schema: { type: string }
 *         description: Filter nach Stichwort im Titel
 *       - in: query
 *         name: location
 *         schema: { type: string }
 *         description: Filter nach Ort
 *       - in: query
 *         name: job_type
 *         schema: { type: string, enum: [Teilzeit, Vollzeit, Werkstudent, Praktikum, Minijob] }
 *         description: Filter nach Anstellungsart
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [aktiv, pausiert, geschlossen] }
 *         description: Filter nach Status
 *     responses:
 *       200:
 *         description: Liste der passenden Stellenanzeigen
 *       500:
 *         description: Interner Serverfehler
 */
// GET /api/v1/jobs
// Optional filters via query string: title, location, job_type, company_id, status.
router.get('/', async (req, res) => {
  try {
    const { title, location, job_type, company_id, status } = req.query;
    const where = [];
    const params = [];

    if (isNonEmptyString(title)) {
      where.push('j.title LIKE ?');
      params.push(`%${title.trim()}%`);
    }
    if (isNonEmptyString(location)) {
      where.push('j.location LIKE ?');
      params.push(`%${location.trim()}%`);
    }
    if (isNonEmptyString(job_type)) {
      where.push('j.job_type = ?');
      params.push(job_type.trim());
    }
    if (isPositiveInt(company_id)) {
      where.push('j.company_id = ?');
      params.push(Number(company_id));
    }
    if (isNonEmptyString(status)) {
      where.push('j.status = ?');
      params.push(status.trim());
    }

    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [rows] = await pool.execute(
      `SELECT j.*, c.name AS company_name
       FROM jobs j
       JOIN companies c ON c.id = j.company_id
       ${whereClause}
       ORDER BY j.created_at DESC, j.id DESC`,
      params
    );
    return sendSuccess(res, 200, rows);
  } catch (err) {
    return sendServerError(res, err, 'GET /jobs');
  }
});

/**
 * @swagger
 * /api/v1/jobs/{id}:
 *   get:
 *     tags: [Jobs]
 *     summary: Einzelne Stellenanzeige abrufen
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *         description: ID der Stellenanzeige
 *     responses:
 *       200:
 *         description: Die Stellenanzeige
 *       404:
 *         description: Job nicht gefunden
 */
// GET /api/v1/jobs/:id
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return sendError(res, 400, 'Ungültige Job-ID.');
    }
    const job = await fetchJobById(id);
    if (!job) {
      return sendError(res, 404, 'Job nicht gefunden.');
    }
    return sendSuccess(res, 200, job);
  } catch (err) {
    return sendServerError(res, err, 'GET /jobs/:id');
  }
});

/**
 * @swagger
 * /api/v1/jobs:
 *   post:
 *     tags: [Jobs]
 *     summary: Neue Stellenanzeige erstellen (Unternehmen-Login erforderlich)
 *     security: [{ cookieAuth: [] }]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, job_type]
 *             properties:
 *               title: { type: string, example: "Werkstudent Backend" }
 *               description: { type: string, example: "Du unterstützt unser Backend-Team..." }
 *               job_type: { type: string, enum: [Teilzeit, Vollzeit, Werkstudent, Praktikum, Minijob], example: "Werkstudent" }
 *               location: { type: string, example: "Berlin" }
 *               salary_range: { type: string, example: "16–20 €/h" }
 *               status: { type: string, enum: [aktiv, pausiert, geschlossen], example: "aktiv" }
 *     responses:
 *       201:
 *         description: Stellenanzeige erstellt
 *       400:
 *         description: Fehlerhafte Eingabe
 *       401:
 *         description: Nicht als Unternehmen angemeldet
 */
// POST /api/v1/jobs – only as a logged-in company, always for itself.
router.post('/', requireCompany, async (req, res) => {
  try {
    const { company_id, title, description, location, job_type, salary_range, status } = req.body || {};

    const errors = [];
    if (!isNonEmptyString(title)) errors.push('title ist erforderlich.');
    if (!isNonEmptyString(description)) errors.push('description ist erforderlich.');
    if (!JOB_TYPES.includes(job_type)) errors.push(`job_type muss einer von [${JOB_TYPES.join(', ')}] sein.`);
    if (status !== undefined && !JOB_STATUSES.includes(status)) {
      errors.push(`status muss einer von [${JOB_STATUSES.join(', ')}] sein.`);
    }
    errors.push(...lengthErrors(req.body || {}));
    if (errors.length) {
      return sendError(res, 400, errors.join(' '));
    }


    if (company_id !== undefined && Number(company_id) !== req.company.id) {
      return sendError(res, 403, 'Stellenanzeigen können nur für das eigene Unternehmen erstellt werden.');
    }

    const [result] = await pool.execute(
      `INSERT INTO jobs (company_id, title, description, location, job_type, salary_range, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        req.company.id,
        title.trim(),
        description.trim(),
        isNonEmptyString(location) ? location.trim() : null,
        job_type,
        isNonEmptyString(salary_range) ? salary_range.trim() : null,
        JOB_STATUSES.includes(status) ? status : 'aktiv',
      ]
    );
    const created = await fetchJobById(result.insertId);
    return sendSuccess(res, 201, created);
  } catch (err) {
    return sendServerError(res, err, 'POST /jobs');
  }
});

// PUT /api/v1/jobs/:id – full update (all fields required), own jobs only.
/**
 * @swagger
 * /api/v1/jobs/{id}:
 *   put:
 *     tags: [Jobs]
 *     summary: Eigene Stellenanzeige vollständig aktualisieren (Unternehmen-Login)
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
 *             required: [title, description, job_type, status]
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               job_type: { type: string, enum: [Teilzeit, Vollzeit, Werkstudent, Praktikum, Minijob] }
 *               status: { type: string, enum: [aktiv, pausiert, geschlossen] }
 *               location: { type: string }
 *               salary_range: { type: string }
 *     responses:
 *       200: { description: Aktualisierte Stellenanzeige }
 *       400: { description: Fehlerhafte Eingabe }
 *       401: { description: Nicht als Unternehmen angemeldet }
 *       403: { description: Gehört einem anderen Unternehmen }
 *       404: { description: Job nicht gefunden }
 */
router.put('/:id', requireCompany, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return sendError(res, 400, 'Ungültige Job-ID.');
    }
    const existing = await fetchJobById(id);
    if (!existing) {
      return sendError(res, 404, 'Job nicht gefunden.');
    }
    if (existing.company_id !== req.company.id) {
      return sendError(res, 403, 'Diese Stellenanzeige gehört einem anderen Unternehmen.');
    }

    const { company_id, title, description, location, job_type, salary_range, status } = req.body || {};
    const errors = [];
    if (!isNonEmptyString(title)) errors.push('title ist erforderlich.');
    if (!isNonEmptyString(description)) errors.push('description ist erforderlich.');
    if (!JOB_TYPES.includes(job_type)) errors.push(`job_type muss einer von [${JOB_TYPES.join(', ')}] sein.`);
    if (!JOB_STATUSES.includes(status)) errors.push(`status muss einer von [${JOB_STATUSES.join(', ')}] sein.`);
    errors.push(...lengthErrors(req.body || {}));
    if (errors.length) {
      return sendError(res, 400, errors.join(' '));
    }
    if (company_id !== undefined && Number(company_id) !== req.company.id) {
      return sendError(res, 403, 'Stellenanzeigen können nicht auf ein anderes Unternehmen übertragen werden.');
    }

    await pool.execute(
      `UPDATE jobs
       SET company_id = ?, title = ?, description = ?, location = ?, job_type = ?, salary_range = ?, status = ?
       WHERE id = ?`,
      [
        req.company.id,
        title.trim(),
        description.trim(),
        isNonEmptyString(location) ? location.trim() : null,
        job_type,
        isNonEmptyString(salary_range) ? salary_range.trim() : null,
        status,
        id,
      ]
    );
    const updated = await fetchJobById(id);
    return sendSuccess(res, 200, updated);
  } catch (err) {
    return sendServerError(res, err, 'PUT /jobs/:id');
  }
});

// PATCH /api/v1/jobs/:id – partial update (only provided fields), own jobs only.
/**
 * @swagger
 * /api/v1/jobs/{id}:
 *   patch:
 *     tags: [Jobs]
 *     summary: Eigene Stellenanzeige teilweise ändern, z. B. nur Status (Unternehmen-Login)
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
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               job_type: { type: string, enum: [Teilzeit, Vollzeit, Werkstudent, Praktikum, Minijob] }
 *               status: { type: string, enum: [aktiv, pausiert, geschlossen] }
 *               location: { type: string }
 *               salary_range: { type: string }
 *     responses:
 *       200: { description: Aktualisierte Stellenanzeige }
 *       400: { description: Fehlerhafte Eingabe }
 *       401: { description: Nicht als Unternehmen angemeldet }
 *       403: { description: Gehört einem anderen Unternehmen }
 *       404: { description: Job nicht gefunden }
 */
router.patch('/:id', requireCompany, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return sendError(res, 400, 'Ungültige Job-ID.');
    }
    const existing = await fetchJobById(id);
    if (!existing) {
      return sendError(res, 404, 'Job nicht gefunden.');
    }
    if (existing.company_id !== req.company.id) {
      return sendError(res, 403, 'Diese Stellenanzeige gehört einem anderen Unternehmen.');
    }

    const body = req.body || {};
    const fields = [];
    const params = [];
    const errors = [];

    if (body.company_id !== undefined && Number(body.company_id) !== req.company.id) {
      errors.push('Stellenanzeigen können nicht auf ein anderes Unternehmen übertragen werden.');
    }
    if (body.title !== undefined) {
      if (!isNonEmptyString(body.title)) errors.push('title darf nicht leer sein.');
      else { fields.push('title = ?'); params.push(body.title.trim()); }
    }
    if (body.description !== undefined) {
      if (!isNonEmptyString(body.description)) errors.push('description darf nicht leer sein.');
      else { fields.push('description = ?'); params.push(body.description.trim()); }
    }
    if (body.location !== undefined) {
      fields.push('location = ?');
      params.push(isNonEmptyString(body.location) ? body.location.trim() : null);
    }
    if (body.job_type !== undefined) {
      if (!JOB_TYPES.includes(body.job_type)) errors.push(`job_type muss einer von [${JOB_TYPES.join(', ')}] sein.`);
      else { fields.push('job_type = ?'); params.push(body.job_type); }
    }
    if (body.salary_range !== undefined) {
      fields.push('salary_range = ?');
      params.push(isNonEmptyString(body.salary_range) ? body.salary_range.trim() : null);
    }
    if (body.status !== undefined) {
      if (!JOB_STATUSES.includes(body.status)) errors.push(`status muss einer von [${JOB_STATUSES.join(', ')}] sein.`);
      else { fields.push('status = ?'); params.push(body.status); }
    }
    errors.push(...lengthErrors(body));

    if (errors.length) {
      return sendError(res, 400, errors.join(' '));
    }
    if (fields.length === 0) {
      return sendError(res, 400, 'Keine gültigen Felder zum Aktualisieren übergeben.');
    }

    params.push(id);
    await pool.execute(`UPDATE jobs SET ${fields.join(', ')} WHERE id = ?`, params);
    const updated = await fetchJobById(id);
    return sendSuccess(res, 200, updated);
  } catch (err) {
    return sendServerError(res, err, 'PATCH /jobs/:id');
  }
});

const REPORT_REASONS = ['fake', 'spam', 'abgelaufen', 'unangemessen', 'sonstiges'];

// POST /api/v1/jobs/:id/report – report a posting (public; no login required).
/**
 * @swagger
 * /api/v1/jobs/{id}/report:
 *   post:
 *     tags: [Jobs]
 *     summary: Stellenanzeige melden (öffentlich, kein Login nötig)
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
 *             required: [reason]
 *             properties:
 *               reason: { type: string, enum: [fake, spam, abgelaufen, unangemessen, sonstiges] }
 *               message: { type: string }
 *     responses:
 *       201: { description: Meldung gespeichert }
 *       400: { description: Ungültiger Grund }
 *       404: { description: Job nicht gefunden }
 */
router.post('/:id/report', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return sendError(res, 400, 'Ungültige Job-ID.');
    }
    if (!(await fetchJobById(id))) {
      return sendError(res, 404, 'Job nicht gefunden.');
    }
    const { reason, message } = req.body || {};
    if (!REPORT_REASONS.includes(reason)) {
      return sendError(res, 400, `reason muss einer von [${REPORT_REASONS.join(', ')}] sein.`);
    }
    if (message !== undefined && isTooLong(message, 500)) {
      return sendError(res, 400, 'message darf höchstens 500 Zeichen lang sein.');
    }
    await pool.execute(
      'INSERT INTO job_reports (job_id, reason, message) VALUES (?, ?, ?)',
      [Number(id), reason, isNonEmptyString(message) ? message.trim() : null]
    );
    return sendSuccess(res, 201, { reported: true });
  } catch (err) {
    return sendServerError(res, err, 'POST /jobs/:id/report');
  }
});

// DELETE /api/v1/jobs/:id – own jobs only.
/**
 * @swagger
 * /api/v1/jobs/{id}:
 *   delete:
 *     tags: [Jobs]
 *     summary: Eigene Stellenanzeige löschen (Unternehmen-Login)
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Job gelöscht }
 *       401: { description: Nicht als Unternehmen angemeldet }
 *       403: { description: Gehört einem anderen Unternehmen }
 *       404: { description: Job nicht gefunden }
 */
router.delete('/:id', requireCompany, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return sendError(res, 400, 'Ungültige Job-ID.');
    }
    const existing = await fetchJobById(id);
    if (!existing) {
      return sendError(res, 404, 'Job nicht gefunden.');
    }
    if (existing.company_id !== req.company.id) {
      return sendError(res, 403, 'Diese Stellenanzeige gehört einem anderen Unternehmen.');
    }
    const [result] = await pool.execute('DELETE FROM jobs WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return sendError(res, 404, 'Job nicht gefunden.');
    }
    return sendSuccess(res, 200, { id: Number(id), deleted: true });
  } catch (err) {
    return sendServerError(res, err, 'DELETE /jobs/:id');
  }
});

module.exports = router;

'use strict';

// ---------------------------------------------------------------------------
// Routes for /api/v1/applications – job applications submitted by students.
// Methods: GET (list + job_id filter), GET/:id, POST, PATCH, DELETE.
// (No PUT per spec – an application is created once and then only changes status.)
// POST is public (guests may apply); all reading/changing/deleting requires a
// logged-in company and is limited to applications for its own job postings,
// because applications contain personal data (names, e-mail addresses).
// ---------------------------------------------------------------------------

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireCompany } = require('../auth');
const {
  sendSuccess,
  sendError,
  sendServerError,
  isNonEmptyString,
  isValidEmail,
  isPositiveInt,
  isTooLong,
} = require('../helpers');

// Allowed status ENUM values – kept in sync with db_setup.sql.
const APPLICATION_STATUSES = ['offen', 'gesehen', 'angenommen', 'abgelehnt'];

// Maximum field lengths (mirror the column sizes in db_setup.sql).
const MAX = { student_name: 100, student_email: 100, cover_letter: 2000 };

/**
 * Loads a single application including the related job title and the id of
 * the company owning the job (needed for the ownership checks), or null.
 */
async function fetchApplicationById(id) {
  const [rows] = await pool.execute(
    `SELECT a.*, j.title AS job_title, j.company_id
     FROM applications a
     JOIN jobs j ON j.id = a.job_id
     WHERE a.id = ?`,
    [id]
  );
  return rows[0] || null;
}

/** Loads id + status of a job, or null if it does not exist. */
async function fetchJobStatus(jobId) {
  const [rows] = await pool.execute('SELECT id, status FROM jobs WHERE id = ?', [jobId]);
  return rows[0] || null;
}

/**
 * @swagger
 * /api/v1/applications:
 *   get:
 *     tags: [Bewerbungen]
 *     summary: Bewerbungen auf die eigenen Stellen abrufen (Unternehmen-Login erforderlich)
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: query
 *         name: job_id
 *         schema: { type: integer }
 *         description: Nur Bewerbungen zu dieser Stelle
 *     responses:
 *       200:
 *         description: Liste der Bewerbungen (nur zu eigenen Jobs)
 *       401:
 *         description: Nicht als Unternehmen angemeldet
 */
// GET /api/v1/applications  – optional filter: ?job_id=
// Always limited to applications for the logged-in company's own jobs.
router.get('/', requireCompany, async (req, res) => {
  try {
    const { job_id } = req.query;
    const where = ['j.company_id = ?'];
    const params = [req.company.id];

    if (isPositiveInt(job_id)) {
      where.push('a.job_id = ?');
      params.push(Number(job_id));
    }

    // LEFT JOIN students on the applicant email so the dashboard knows whether
    // the applicant has an account (and can link to their profile).
    const [rows] = await pool.execute(
      `SELECT a.*, j.title AS job_title, s.id AS student_id
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       LEFT JOIN students s ON s.email = a.student_email
       WHERE ${where.join(' AND ')}
       ORDER BY a.created_at DESC, a.id DESC`,
      params
    );
    return sendSuccess(res, 200, rows);
  } catch (err) {
    return sendServerError(res, err, 'GET /applications');
  }
});

// GET /api/v1/applications/:id – own jobs only.
/**
 * @swagger
 * /api/v1/applications/{id}:
 *   get:
 *     tags: [Bewerbungen]
 *     summary: Einzelne Bewerbung abrufen (nur zu eigenen Jobs)
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Die Bewerbung }
 *       401: { description: Nicht als Unternehmen angemeldet }
 *       403: { description: Gehört zu einem anderen Unternehmen }
 *       404: { description: Bewerbung nicht gefunden }
 */
router.get('/:id', requireCompany, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return sendError(res, 400, 'Ungültige Bewerbungs-ID.');
    }
    const application = await fetchApplicationById(id);
    if (!application) {
      return sendError(res, 404, 'Bewerbung nicht gefunden.');
    }
    if (application.company_id !== req.company.id) {
      return sendError(res, 403, 'Diese Bewerbung gehört zu einer Stelle eines anderen Unternehmens.');
    }
    return sendSuccess(res, 200, application);
  } catch (err) {
    return sendServerError(res, err, 'GET /applications/:id');
  }
});

/**
 * @swagger
 * /api/v1/applications:
 *   post:
 *     tags: [Bewerbungen]
 *     summary: Bewerbung einreichen (auch ohne Konto möglich)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [job_id, student_name, student_email]
 *             properties:
 *               job_id: { type: integer, example: 1 }
 *               student_name: { type: string, example: "Lena Hofmann" }
 *               student_email: { type: string, example: "lena@uni.de" }
 *               cover_letter: { type: string, example: "Sehr geehrtes Team, ..." }
 *     responses:
 *       201:
 *         description: Bewerbung erfolgreich eingereicht
 *       400:
 *         description: Fehlerhafte Eingabe, inaktive Stelle oder Doppelbewerbung
 */
// POST /api/v1/applications  – submit a new application.
// Public endpoint: new applications always start with status "offen" – the
// status can only be changed later by the company via PATCH.
router.post('/', async (req, res) => {
  try {
    const { job_id, student_name, student_email, cover_letter } = req.body || {};

    const errors = [];
    if (!isPositiveInt(job_id)) errors.push('job_id muss eine positive Ganzzahl sein.');
    if (!isNonEmptyString(student_name)) errors.push('student_name ist erforderlich.');
    else if (isTooLong(student_name, MAX.student_name)) errors.push(`student_name darf höchstens ${MAX.student_name} Zeichen lang sein.`);
    if (!isValidEmail(student_email)) errors.push('student_email muss eine gültige E-Mail-Adresse sein.');
    else if (isTooLong(student_email, MAX.student_email)) errors.push(`student_email darf höchstens ${MAX.student_email} Zeichen lang sein.`);
    if (isTooLong(cover_letter, MAX.cover_letter)) errors.push(`cover_letter darf höchstens ${MAX.cover_letter} Zeichen lang sein.`);
    if (errors.length) {
      return sendError(res, 400, errors.join(' '));
    }

    // The job must exist and accept applications (only active postings do).
    const job = await fetchJobStatus(Number(job_id));
    if (!job) {
      return sendError(res, 400, 'Angegebener Job (job_id) existiert nicht.');
    }
    if (job.status !== 'aktiv') {
      return sendError(res, 400, 'Diese Stelle nimmt derzeit keine Bewerbungen entgegen.');
    }

    // Prevent duplicate applications (same email for the same job).
    const [dupRows] = await pool.execute(
      'SELECT id FROM applications WHERE job_id = ? AND student_email = ?',
      [Number(job_id), student_email.trim()]
    );
    if (dupRows.length > 0) {
      return sendError(res, 400, 'Mit dieser E-Mail-Adresse wurde bereits eine Bewerbung für diese Stelle eingereicht.');
    }

    const [result] = await pool.execute(
      `INSERT INTO applications (job_id, student_name, student_email, cover_letter, status)
       VALUES (?, ?, ?, ?, 'offen')`,
      [
        Number(job_id),
        student_name.trim(),
        student_email.trim(),
        isNonEmptyString(cover_letter) ? cover_letter.trim() : null,
      ]
    );
    const created = await fetchApplicationById(result.insertId);
    return sendSuccess(res, 201, created);
  } catch (err) {
    return sendServerError(res, err, 'POST /applications');
  }
});

// PATCH /api/v1/applications/:id – partial update, primarily the status.
// Only the company owning the related job posting may change an application.
/**
 * @swagger
 * /api/v1/applications/{id}:
 *   patch:
 *     tags: [Bewerbungen]
 *     summary: Bewerbungsstatus ändern (Unternehmen-Login)
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
 *               status: { type: string, enum: [offen, gesehen, angenommen, abgelehnt] }
 *     responses:
 *       200: { description: Aktualisierte Bewerbung }
 *       400: { description: Fehlerhafte Eingabe }
 *       401: { description: Nicht als Unternehmen angemeldet }
 *       403: { description: Gehört zu einem anderen Unternehmen }
 *       404: { description: Bewerbung nicht gefunden }
 */
router.patch('/:id', requireCompany, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return sendError(res, 400, 'Ungültige Bewerbungs-ID.');
    }
    const existing = await fetchApplicationById(id);
    if (!existing) {
      return sendError(res, 404, 'Bewerbung nicht gefunden.');
    }
    if (existing.company_id !== req.company.id) {
      return sendError(res, 403, 'Diese Bewerbung gehört zu einer Stelle eines anderen Unternehmens.');
    }

    const body = req.body || {};
    const fields = [];
    const params = [];
    const errors = [];

    if (body.status !== undefined) {
      if (!APPLICATION_STATUSES.includes(body.status)) {
        errors.push(`status muss einer von [${APPLICATION_STATUSES.join(', ')}] sein.`);
      } else {
        fields.push('status = ?');
        params.push(body.status);
      }
    }
    if (body.student_name !== undefined) {
      if (!isNonEmptyString(body.student_name)) errors.push('student_name darf nicht leer sein.');
      else if (isTooLong(body.student_name, MAX.student_name)) errors.push(`student_name darf höchstens ${MAX.student_name} Zeichen lang sein.`);
      else { fields.push('student_name = ?'); params.push(body.student_name.trim()); }
    }
    if (body.student_email !== undefined) {
      if (!isValidEmail(body.student_email)) errors.push('student_email muss eine gültige E-Mail-Adresse sein.');
      else if (isTooLong(body.student_email, MAX.student_email)) errors.push(`student_email darf höchstens ${MAX.student_email} Zeichen lang sein.`);
      else { fields.push('student_email = ?'); params.push(body.student_email.trim()); }
    }
    if (body.cover_letter !== undefined) {
      if (isTooLong(body.cover_letter, MAX.cover_letter)) {
        errors.push(`cover_letter darf höchstens ${MAX.cover_letter} Zeichen lang sein.`);
      } else {
        fields.push('cover_letter = ?');
        params.push(isNonEmptyString(body.cover_letter) ? body.cover_letter.trim() : null);
      }
    }

    if (errors.length) {
      return sendError(res, 400, errors.join(' '));
    }
    if (fields.length === 0) {
      return sendError(res, 400, 'Keine gültigen Felder zum Aktualisieren übergeben.');
    }

    params.push(id);
    await pool.execute(`UPDATE applications SET ${fields.join(', ')} WHERE id = ?`, params);
    const updated = await fetchApplicationById(id);
    return sendSuccess(res, 200, updated);
  } catch (err) {
    return sendServerError(res, err, 'PATCH /applications/:id');
  }
});

// DELETE /api/v1/applications/:id – own jobs only.
/**
 * @swagger
 * /api/v1/applications/{id}:
 *   delete:
 *     tags: [Bewerbungen]
 *     summary: Bewerbung löschen (Unternehmen-Login)
 *     security: [{ cookieAuth: [] }]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Bewerbung gelöscht }
 *       401: { description: Nicht als Unternehmen angemeldet }
 *       403: { description: Gehört zu einem anderen Unternehmen }
 *       404: { description: Bewerbung nicht gefunden }
 */
router.delete('/:id', requireCompany, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return sendError(res, 400, 'Ungültige Bewerbungs-ID.');
    }
    const existing = await fetchApplicationById(id);
    if (!existing) {
      return sendError(res, 404, 'Bewerbung nicht gefunden.');
    }
    if (existing.company_id !== req.company.id) {
      return sendError(res, 403, 'Diese Bewerbung gehört zu einer Stelle eines anderen Unternehmens.');
    }
    await pool.execute('DELETE FROM applications WHERE id = ?', [id]);
    return sendSuccess(res, 200, { id: Number(id), deleted: true });
  } catch (err) {
    return sendServerError(res, err, 'DELETE /applications/:id');
  }
});

module.exports = router;

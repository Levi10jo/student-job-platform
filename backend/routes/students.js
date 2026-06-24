'use strict';

// ---------------------------------------------------------------------------
// Routes for /api/v1/students – the student "About me" profile.
// Methods: GET /me, PUT /me (own profile, student login required) and
// GET /:id (view a profile, with visibility-based access control).
//
// Visibility model (profile_visibility column):
//   'applied' – only companies the student has applied to may view the profile
//   'all'     – every logged-in company may view it
// The student themselves may always view their own profile.
// ---------------------------------------------------------------------------

const express = require('express');
const router = express.Router();
const { pool } = require('../db');
const { requireStudent, getAuthUser, syncSessions, clearSessionCookie } = require('../auth');
const {
  sendSuccess,
  sendError,
  sendServerError,
  isPositiveInt,
  isTooLong,
} = require('../helpers');

const VISIBILITIES = ['applied', 'all'];
// Maximum field lengths (mirror the column sizes in db_setup.sql).
const MAX = {
  headline: 150, bio: 2000, skills: 500,
  study_program: 150, university: 150, location: 100, website: 255,
};

// Public profile columns (never expose password_hash or the raw cv_data blob;
// cv_filename/cv_uploaded_at signal that a CV exists and is downloadable).
const PROFILE_COLUMNS =
  'id, name, email, headline, bio, skills, study_program, university, location, website, profile_visibility, cv_filename, cv_uploaded_at, created_at';

// CV upload limits.
const CV_MAX_BYTES = 3 * 1024 * 1024; // 3 MB

/** Loads a student profile by id, or null. */
async function fetchStudentById(id) {
  const [rows] = await pool.execute(
    `SELECT ${PROFILE_COLUMNS} FROM students WHERE id = ?`,
    [id]
  );
  return rows[0] || null;
}

/**
 * True if the given company has at least one application from this student
 * (matched by the student's email, since applications store the email).
 */
async function companyHasApplicationFrom(companyId, studentEmail) {
  const [rows] = await pool.execute(
    `SELECT 1
     FROM applications a
     JOIN jobs j ON j.id = a.job_id
     WHERE j.company_id = ? AND a.student_email = ?
     LIMIT 1`,
    [companyId, studentEmail]
  );
  return rows.length > 0;
}

/**
 * Decides whether `viewer` (or null for guests) may see `student`'s profile:
 * the student themselves, a company the student applied to, or anyone when the
 * profile is public ('all'). Returns true/false.
 */
async function canViewProfile(viewer, student) {
  if (viewer && viewer.role === 'student' && viewer.id === student.id) return true;
  if (viewer && viewer.role === 'company') {
    if (student.profile_visibility === 'all') return true;
    return companyHasApplicationFrom(viewer.id, student.email);
  }
  return false;
}

// GET /api/v1/students/me – own profile (student login required).
/**
 * @swagger
 * /api/v1/students/me:
 *   get:
 *     tags: [Studenten]
 *     summary: Eigenes Profil abrufen (Studenten-Login)
 *     responses:
 *       200: { description: Das eigene Profil }
 *       401: { description: Nicht als Student angemeldet }
 */
router.get('/me', requireStudent, async (req, res) => {
  try {
    const student = await fetchStudentById(req.student.id);
    if (!student) {
      return sendError(res, 404, 'Profil nicht gefunden.');
    }
    return sendSuccess(res, 200, student);
  } catch (err) {
    return sendServerError(res, err, 'GET /students/me');
  }
});

// GET /api/v1/students/me/applications – the logged-in student's own
// applications (matched by their account email), with job + company info.
/**
 * @swagger
 * /api/v1/students/me/applications:
 *   get:
 *     tags: [Studenten]
 *     summary: Eigene Bewerbungen samt Status (Studenten-Login)
 *     responses:
 *       200: { description: Liste der eigenen Bewerbungen }
 *       401: { description: Nicht als Student angemeldet }
 */
router.get('/me/applications', requireStudent, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT a.id, a.job_id, a.status, a.created_at,
              j.title AS job_title, j.status AS job_status,
              c.name AS company_name
       FROM applications a
       JOIN jobs j ON j.id = a.job_id
       JOIN companies c ON c.id = j.company_id
       WHERE a.student_email = ?
       ORDER BY a.created_at DESC, a.id DESC`,
      [req.student.email]
    );
    return sendSuccess(res, 200, rows);
  } catch (err) {
    return sendServerError(res, err, 'GET /students/me/applications');
  }
});

// --- Job-Alerts (gespeicherte Suchen) ------------------------------------
// Die E-Mail-Zustellung wird im MVP nur simuliert (console-Log im Dev-Modus),
// es ist bewusst kein echter Mailserver angebunden.

const ALERT_JOB_TYPES = ['Teilzeit', 'Vollzeit', 'Werkstudent', 'Praktikum', 'Minijob'];

// Builds the shared WHERE clause for an alert's (optional) criteria.
// A job "matches" an alert when it is active and fits every set criterion –
// exactly the same logic the job search uses, so the alert is just a saved search.
function alertWhere(alert) {
  const where = ["j.status = 'aktiv'"];
  const params = [];
  if (alert.title) { where.push('j.title LIKE ?'); params.push(`%${alert.title}%`); }
  if (alert.location) { where.push('j.location LIKE ?'); params.push(`%${alert.location}%`); }
  if (alert.job_type) { where.push('j.job_type = ?'); params.push(alert.job_type); }
  return { clause: where.join(' AND '), params };
}

/** Counts currently active jobs matching an alert's criteria. */
async function countAlertMatches(alert) {
  const { clause, params } = alertWhere(alert);
  const [rows] = await pool.execute(`SELECT COUNT(*) AS n FROM jobs j WHERE ${clause}`, params);
  return rows[0].n;
}

/** Returns the newest active jobs matching an alert (the suggested jobs). */
async function fetchAlertMatches(alert, limit) {
  const { clause, params } = alertWhere(alert);
  // limit is an internal integer, safely inlined (LIMIT can't be a bound param).
  const [rows] = await pool.execute(
    `SELECT j.id, j.title, j.job_type, j.location, j.created_at, c.name AS company_name
     FROM jobs j JOIN companies c ON c.id = j.company_id
     WHERE ${clause}
     ORDER BY j.created_at DESC, j.id DESC
     LIMIT ${Number(limit) || 5}`,
    params
  );
  return rows;
}

// GET /api/v1/students/me/alerts – own alerts incl. current matches.
// Each alert carries match_count (total) and matches (the newest few jobs),
// so the profile can show exactly which jobs the alert suggests.
/**
 * @swagger
 * /api/v1/students/me/alerts:
 *   get:
 *     tags: [Studenten]
 *     summary: Eigene Job-Alerts inkl. passender Jobs (Studenten-Login)
 *     responses:
 *       200: { description: Liste der Job-Alerts mit Trefferzahl + Treffern }
 *       401: { description: Nicht als Student angemeldet }
 */
router.get('/me/alerts', requireStudent, async (req, res) => {
  try {
    const [alerts] = await pool.execute(
      'SELECT id, title, location, job_type, created_at FROM job_alerts WHERE student_id = ? ORDER BY created_at DESC, id DESC',
      [req.student.id]
    );
    for (const alert of alerts) {
      alert.match_count = await countAlertMatches(alert);
      alert.matches = await fetchAlertMatches(alert, 5);
    }
    return sendSuccess(res, 200, alerts);
  } catch (err) {
    return sendServerError(res, err, 'GET /students/me/alerts');
  }
});

// POST /api/v1/students/me/alerts – create an alert from search criteria.
/**
 * @swagger
 * /api/v1/students/me/alerts:
 *   post:
 *     tags: [Studenten]
 *     summary: Job-Alert aus Suchkriterien anlegen (Studenten-Login)
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               location: { type: string }
 *               job_type: { type: string, enum: [Teilzeit, Vollzeit, Werkstudent, Praktikum, Minijob] }
 *     responses:
 *       201: { description: Job-Alert angelegt }
 *       400: { description: Fehlerhafte Eingabe }
 *       401: { description: Nicht als Student angemeldet }
 */
router.post('/me/alerts', requireStudent, async (req, res) => {
  try {
    const { title, location, job_type } = req.body || {};
    if (job_type !== undefined && job_type !== '' && !ALERT_JOB_TYPES.includes(job_type)) {
      return sendError(res, 400, `job_type muss leer oder einer von [${ALERT_JOB_TYPES.join(', ')}] sein.`);
    }
    if (isTooLong(title, 150) || isTooLong(location, 100)) {
      return sendError(res, 400, 'title/location sind zu lang.');
    }
    const clean = (v, max) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : '');
    const [result] = await pool.execute(
      'INSERT INTO job_alerts (student_id, title, location, job_type) VALUES (?, ?, ?, ?)',
      [req.student.id, clean(title, 150), clean(location, 100), ALERT_JOB_TYPES.includes(job_type) ? job_type : '']
    );
    // Simulated e-mail delivery: in a real system a scheduled job would send a
    // mail when matching postings appear. Here we only log it in development.
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log(`[Job-Alert] (simuliert) Benachrichtigungen an ${req.student.email} eingerichtet (Alert #${result.insertId}).`);
    }
    const [rows] = await pool.execute(
      'SELECT id, title, location, job_type, created_at FROM job_alerts WHERE id = ?',
      [result.insertId]
    );
    const created = rows[0];
    created.match_count = await countAlertMatches(created);
    return sendSuccess(res, 201, created);
  } catch (err) {
    return sendServerError(res, err, 'POST /students/me/alerts');
  }
});

// DELETE /api/v1/students/me/alerts/:id – remove one of the student's alerts.
/**
 * @swagger
 * /api/v1/students/me/alerts/{id}:
 *   delete:
 *     tags: [Studenten]
 *     summary: Eigenen Job-Alert löschen (Studenten-Login)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Alert gelöscht }
 *       401: { description: Nicht als Student angemeldet }
 *       404: { description: Alert nicht gefunden }
 */
router.delete('/me/alerts/:id', requireStudent, async (req, res) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return sendError(res, 400, 'Ungültige Alert-ID.');
    }
    const [result] = await pool.execute(
      'DELETE FROM job_alerts WHERE id = ? AND student_id = ?',
      [Number(id), req.student.id]
    );
    if (result.affectedRows === 0) {
      return sendError(res, 404, 'Job-Alert nicht gefunden.');
    }
    return sendSuccess(res, 200, { id: Number(id), deleted: true });
  } catch (err) {
    return sendServerError(res, err, 'DELETE /students/me/alerts/:id');
  }
});

// PUT /api/v1/students/me – update own profile (student login required).
/**
 * @swagger
 * /api/v1/students/me:
 *   put:
 *     tags: [Studenten]
 *     summary: Eigenes Profil bearbeiten (Studenten-Login)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               headline: { type: string }
 *               bio: { type: string }
 *               skills: { type: string, description: "kommagetrennt" }
 *               study_program: { type: string }
 *               university: { type: string }
 *               location: { type: string }
 *               website: { type: string }
 *               profile_visibility: { type: string, enum: [applied, all] }
 *     responses:
 *       200: { description: Aktualisiertes Profil }
 *       400: { description: Fehlerhafte Eingabe }
 *       401: { description: Nicht als Student angemeldet }
 */
router.put('/me', requireStudent, async (req, res) => {
  try {
    const body = req.body || {};
    const errors = [];

    // All profile fields are optional strings; validate lengths only.
    Object.keys(MAX).forEach((field) => {
      if (isTooLong(body[field], MAX[field])) {
        errors.push(`${field} darf höchstens ${MAX[field]} Zeichen lang sein.`);
      }
    });
    const visibility = body.profile_visibility;
    if (visibility !== undefined && !VISIBILITIES.includes(visibility)) {
      errors.push(`profile_visibility muss "applied" oder "all" sein.`);
    }
    if (errors.length) {
      return sendError(res, 400, errors.join(' '));
    }

    // Normalise: empty strings become NULL; trim everything.
    const val = (field) => {
      const v = body[field];
      return typeof v === 'string' && v.trim() ? v.trim() : null;
    };
    // Normalise the website so links work even without a typed protocol.
    let website = val('website');
    if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;

    await pool.execute(
      `UPDATE students SET
         headline = ?, bio = ?, skills = ?, study_program = ?,
         university = ?, location = ?, website = ?, profile_visibility = ?
       WHERE id = ?`,
      [
        val('headline'),
        val('bio'),
        val('skills'),
        val('study_program'),
        val('university'),
        val('location'),
        website,
        VISIBILITIES.includes(visibility) ? visibility : 'applied',
        req.student.id,
      ]
    );
    const updated = await fetchStudentById(req.student.id);
    return sendSuccess(res, 200, updated);
  } catch (err) {
    return sendServerError(res, err, 'PUT /students/me');
  }
});

// PUT /api/v1/students/me/cv – upload/replace own CV (PDF, base64 in JSON).
/**
 * @swagger
 * /api/v1/students/me/cv:
 *   put:
 *     tags: [Studenten]
 *     summary: Lebenslauf (PDF) hochladen/ersetzen (Studenten-Login)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [filename, data]
 *             properties:
 *               filename: { type: string, example: "lebenslauf.pdf" }
 *               data: { type: string, description: "PDF base64-kodiert (max. 3 MB)" }
 *     responses:
 *       200: { description: Lebenslauf gespeichert }
 *       400: { description: Keine gültige PDF oder zu groß }
 *       401: { description: Nicht als Student angemeldet }
 */
router.put('/me/cv', requireStudent, async (req, res) => {
  try {
    const { filename, data } = req.body || {};
    if (typeof filename !== 'string' || !/\.pdf$/i.test(filename.trim()) || filename.trim().length > 255) {
      return sendError(res, 400, 'Bitte eine PDF-Datei mit gültigem Dateinamen hochladen.');
    }
    if (typeof data !== 'string' || data.length === 0) {
      return sendError(res, 400, 'Es wurden keine Dateidaten übertragen.');
    }
    const buffer = Buffer.from(data, 'base64');
    if (buffer.length === 0) {
      return sendError(res, 400, 'Die Datei konnte nicht gelesen werden.');
    }
    if (buffer.length > CV_MAX_BYTES) {
      return sendError(res, 400, `Die Datei ist zu groß (max. ${Math.round(CV_MAX_BYTES / (1024 * 1024))} MB).`);
    }
    // Verify it really is a PDF (magic header) – cheap defence against
    // mislabelled or malicious uploads.
    if (buffer.slice(0, 5).toString('latin1') !== '%PDF-') {
      return sendError(res, 400, 'Die Datei ist keine gültige PDF-Datei.');
    }
    await pool.execute(
      'UPDATE students SET cv_filename = ?, cv_data = ?, cv_uploaded_at = CURRENT_TIMESTAMP WHERE id = ?',
      [filename.trim(), data, req.student.id]
    );
    const updated = await fetchStudentById(req.student.id);
    return sendSuccess(res, 200, updated);
  } catch (err) {
    return sendServerError(res, err, 'PUT /students/me/cv');
  }
});

// DELETE /api/v1/students/me/cv – remove own CV.
/**
 * @swagger
 * /api/v1/students/me/cv:
 *   delete:
 *     tags: [Studenten]
 *     summary: Eigenen Lebenslauf entfernen (Studenten-Login)
 *     responses:
 *       200: { description: Lebenslauf entfernt }
 *       401: { description: Nicht als Student angemeldet }
 */
router.delete('/me/cv', requireStudent, async (req, res) => {
  try {
    await pool.execute(
      'UPDATE students SET cv_filename = NULL, cv_data = NULL, cv_uploaded_at = NULL WHERE id = ?',
      [req.student.id]
    );
    const updated = await fetchStudentById(req.student.id);
    return sendSuccess(res, 200, updated);
  } catch (err) {
    return sendServerError(res, err, 'DELETE /students/me/cv');
  }
});

// DELETE /api/v1/students/me – delete own account.
// Removes the student's own applications (their personal data, linked by email,
// no FK) and the account row, then ends all of the student's sessions.
/**
 * @swagger
 * /api/v1/students/me:
 *   delete:
 *     tags: [Studenten]
 *     summary: Eigenes Konto löschen (inkl. eigener Bewerbungen)
 *     responses:
 *       200: { description: Konto gelöscht }
 *       401: { description: Nicht als Student angemeldet }
 */
router.delete('/me', requireStudent, async (req, res) => {
  try {
    await pool.execute('DELETE FROM applications WHERE student_email = ?', [req.student.email]);
    await pool.execute('DELETE FROM students WHERE id = ?', [req.student.id]);
    syncSessions('student', req.student.id, null);
    clearSessionCookie(res);
    return sendSuccess(res, 200, { id: req.student.id, deleted: true });
  } catch (err) {
    return sendServerError(res, err, 'DELETE /students/me');
  }
});

// GET /api/v1/students/:id – view a profile, subject to access control.
/**
 * @swagger
 * /api/v1/students/{id}:
 *   get:
 *     tags: [Studenten]
 *     summary: Studenten-Profil ansehen (mit Zugriffskontrolle)
 *     description: Sichtbar für die Person selbst, für Unternehmen mit Bewerbung dieser Person oder bei Sichtbarkeit "all".
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200: { description: Das Profil }
 *       401: { description: Nicht angemeldet }
 *       403: { description: Profil nicht freigegeben }
 *       404: { description: Profil nicht gefunden }
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return sendError(res, 400, 'Ungültige Profil-ID.');
    }
    const student = await fetchStudentById(Number(id));
    if (!student) {
      return sendError(res, 404, 'Profil nicht gefunden.');
    }

    const viewer = getAuthUser(req);
    if (await canViewProfile(viewer, student)) {
      return sendSuccess(res, 200, student);
    }
    if (viewer && viewer.role === 'company') {
      return sendError(res, 403, 'Dieses Profil ist für dein Unternehmen nicht freigegeben.');
    }
    return sendError(res, 401, 'Bitte melde dich an, um dieses Profil zu sehen.');
  } catch (err) {
    return sendServerError(res, err, 'GET /students/:id');
  }
});

// GET /api/v1/students/:id/cv – download a student's CV (PDF), access-controlled.
/**
 * @swagger
 * /api/v1/students/{id}/cv:
 *   get:
 *     tags: [Studenten]
 *     summary: Lebenslauf herunterladen (gleiche Zugriffskontrolle wie das Profil)
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: integer }
 *     responses:
 *       200:
 *         description: PDF-Datei
 *         content:
 *           application/pdf: {}
 *       401: { description: Nicht angemeldet }
 *       403: { description: Kein Zugriff }
 *       404: { description: Kein Lebenslauf vorhanden }
 */
router.get('/:id/cv', async (req, res) => {
  try {
    const { id } = req.params;
    if (!isPositiveInt(id)) {
      return sendError(res, 400, 'Ungültige Profil-ID.');
    }
    const student = await fetchStudentById(Number(id));
    if (!student) {
      return sendError(res, 404, 'Profil nicht gefunden.');
    }
    if (!(await canViewProfile(getAuthUser(req), student))) {
      return sendError(res, 403, 'Kein Zugriff auf diesen Lebenslauf.');
    }
    if (!student.cv_filename) {
      return sendError(res, 404, 'Für dieses Profil ist kein Lebenslauf hinterlegt.');
    }
    // Fetch the raw base64 blob only now (kept out of the normal profile query).
    const [rows] = await pool.execute('SELECT cv_data FROM students WHERE id = ?', [Number(id)]);
    const buffer = Buffer.from(rows[0].cv_data || '', 'base64');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(student.cv_filename)}"`);
    res.setHeader('Content-Length', buffer.length);
    return res.send(buffer);
  } catch (err) {
    return sendServerError(res, err, 'GET /students/:id/cv');
  }
});

module.exports = router;

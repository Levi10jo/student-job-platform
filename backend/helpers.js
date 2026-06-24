'use strict';

// ---------------------------------------------------------------------------
// Shared helpers for all route modules: unified JSON responses + validation.
// Keeping these in one place avoids duplicating the response shape and the
// validation rules across jobs/applications/companies.
// ---------------------------------------------------------------------------

/**
 * Sends a successful JSON response: { success: true, data }.
 */
function sendSuccess(res, status, data) {
  return res.status(status).json({ success: true, data });
}

/**
 * Sends an error JSON response: { success: false, error }.
 */
function sendError(res, status, error) {
  return res.status(status).json({ success: false, error });
}

/**
 * Centralised handler for unexpected (500) errors. Logs details only in
 * development and always returns a safe, generic message to the client.
 */
function sendServerError(res, err, context) {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error(`[${context}]`, err);
  }
  return sendError(res, 500, 'Interner Serverfehler. Bitte später erneut versuchen.');
}

// --- Validation helpers ----------------------------------------------------

/** True if value is a string with at least one non-whitespace character. */
function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/** Basic email format check (sufficient for MVP server-side validation). */
function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** True if value represents a positive integer (e.g. a database id). */
function isPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

/**
 * True if value is a string longer than max characters (after trim).
 * Used to reject input that would not fit the database columns – otherwise
 * MySQL raises an error and the client only sees a generic 500.
 */
function isTooLong(value, max) {
  return typeof value === 'string' && value.trim().length > max;
}

module.exports = {
  sendSuccess,
  sendError,
  sendServerError,
  isNonEmptyString,
  isValidEmail,
  isPositiveInt,
  isTooLong,
};

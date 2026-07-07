'use strict';

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

function sendServerError(res, err, context) {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error(`[${context}]`, err);
  }
  return sendError(res, 500, 'Interner Serverfehler. Bitte später erneut versuchen.');
}

// --- Validation helpers ----------------------------------------------------

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isValidEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0;
}

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

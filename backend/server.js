'use strict';

// ---------------------------------------------------------------------------
// StudyWork – Express server entry point.
// Serves the REST API under /api/v1 and the static frontend from frontend/.
// Frontend and API share the same origin/port, so no CORS handling is needed.
// ---------------------------------------------------------------------------

const path = require('path');

// Load environment variables from the project-root .env as early as possible,
// before any module that reads process.env (e.g. db.js) is used.
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const swaggerUi = require('swagger-ui-express');
const swaggerJsdoc = require('swagger-jsdoc');
const { testConnection } = require('./db');

const jobsRouter = require('./routes/jobs');
const applicationsRouter = require('./routes/applications');
const companiesRouter = require('./routes/companies');
const authRouter = require('./routes/auth');
const studentsRouter = require('./routes/students');

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Parse JSON request bodies. The REST API uses JSON for all writes.
// The limit is raised to a few MB so small PDF CVs (base64-encoded in JSON,
// see students.js) fit; per-field size is still validated in the routes.
app.use(express.json({ limit: '6mb' }));

// --- REST API routes (all under the /api/v1 prefix) ---
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/jobs', jobsRouter);
app.use('/api/v1/applications', applicationsRouter);
app.use('/api/v1/companies', companiesRouter);
app.use('/api/v1/students', studentsRouter);

/**
 * @swagger
 * /api/v1/health:
 *   get:
 *     tags: [System]
 *     summary: Verfügbarkeits-Check des Servers
 *     responses:
 *       200:
 *         description: Server läuft
 */
// Lightweight health check (useful for smoke tests / monitoring).
app.get('/api/v1/health', (req, res) => {
  res.json({ success: true, data: { status: 'ok' } });
});

// --- Swagger / OpenAPI documentation ---
// Generated from the @swagger JSDoc comments in the route files and served as
// an interactive UI under /api-docs (mounted before the 404 handler).
const swaggerOptions = {
  swaggerDefinition: {
    openapi: '3.0.0',
    info: {
      title: 'StudyWork API',
      version: '1.0.0',
      description:
        'REST-API der StudyWork-Jobplattform (Stellenanzeigen, Bewerbungen, '
        + 'Unternehmen, Studenten-Profile, Authentifizierung).\n\n'
        + 'Mit 🔒 markierte Endpunkte benötigen eine aktive Login-Session '
        + '(HttpOnly-Cookie `sw_session`). Zum Ausprobieren: zuerst über '
        + '`POST /api/v1/auth/login` anmelden – der Browser übernimmt das '
        + 'Cookie dann automatisch für alle weiteren "Try it out"-Aufrufe.\n\n'
        + '**Demo-Zugänge** (Passwort jeweils `studywork123`): Unternehmen '
        + '`kontakt@technova.de` · Student `lena.hofmann@uni-berlin.de`.',
    },
    servers: [{ url: 'http://localhost:3000', description: 'Lokale Entwicklung' }],
    // Grouping shown in the UI (order + descriptions of the sections).
    tags: [
      { name: 'Jobs', description: 'Stellenanzeigen suchen, anlegen, verwalten und melden' },
      { name: 'Bewerbungen', description: 'Bewerbungen einreichen (öffentlich) und als Unternehmen verwalten' },
      { name: 'Unternehmen', description: 'Unternehmensprofile lesen und das eigene Profil verwalten' },
      { name: 'Studenten', description: 'Eigenes Profil, Lebenslauf (PDF), Bewerbungen und Job-Alerts' },
      { name: 'Auth', description: 'Registrierung, Login/Logout und Session-Abfrage' },
      { name: 'System', description: 'Technische Endpunkte (Verfügbarkeits-Check)' },
    ],
    components: {
      securitySchemes: {
        // Our session cookie; routes marked with `security: [{ cookieAuth: [] }]`
        // get a padlock icon in the Swagger UI.
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'sw_session',
          description: 'Session-Cookie, gesetzt durch POST /api/v1/auth/login bzw. /register.',
        },
      },
    },
  },
  // Absolute paths so the comments are found regardless of the start directory.
  apis: [path.join(__dirname, 'routes', '*.js'), path.join(__dirname, 'server.js')],
};
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
// Raw spec as JSON (handy for tools / quick checks).
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

// --- Static frontend ---
// frontend/ lives one level up from backend/. express.static serves index.html
// for "/" automatically and all other assets (css, js, html pages).
const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

// --- 404 handling ---
// Unknown API endpoints return JSON; any other unknown path serves 404.html.
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'Endpunkt nicht gefunden.' });
  }
  return res.status(404).sendFile(path.join(frontendDir, '404.html'));
});

// --- Central error handler ---
// Catches errors forwarded via next(err), e.g. malformed JSON from express.json().
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.error('[Unhandled error]', err);
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Ungültiges JSON im Request-Body.' });
  }
  return res.status(500).json({ success: false, error: 'Interner Serverfehler.' });
});

// --- Startup ---
// Verify the database is reachable before accepting requests, so misconfigured
// setups fail immediately with a clear message instead of on first request.
async function start() {
  // 1) Verify the database is reachable before binding the port.
  try {
    await testConnection();
  } catch (err) {
    // A failed DB connection is fatal at startup and must always be visible.
    // eslint-disable-next-line no-console
    console.error('Serverstart fehlgeschlagen – keine Datenbankverbindung:', err.message);
    // eslint-disable-next-line no-console
    console.error('Läuft der MySQL-Server und stimmen die Zugangsdaten in der .env?');
    process.exit(1);
  }

  // 2) Start listening. Handle listen errors (e.g. port already in use) with a
  //    clear message instead of crashing on an unhandled 'error' event.
  const server = app.listen(PORT, () => {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.log(`StudyWork-Server läuft auf http://localhost:${PORT}`);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      // eslint-disable-next-line no-console
      console.error(`Port ${PORT} ist bereits belegt. Beende den anderen Prozess (z. B. \`lsof -ti:${PORT} | xargs kill\`) oder setze einen anderen PORT in der .env.`);
    } else {
      // eslint-disable-next-line no-console
      console.error('Serverstart fehlgeschlagen:', err.message);
    }
    process.exit(1);
  });
}

start();

module.exports = app;

'use strict';

const path = require('path');

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

app.use(express.json({ limit: '6mb' }));

// --- REST API routes
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
        cookieAuth: {
          type: 'apiKey',
          in: 'cookie',
          name: 'sw_session',
          description: 'Session-Cookie, gesetzt durch POST /api/v1/auth/login bzw. /register.',
        },
      },
    },
  },
  apis: [
    path.join(__dirname, 'routes', '*.js').replace(/\\/g, '/'),
    path.join(__dirname, 'server.js').replace(/\\/g, '/'),
  ],
};
console.log(swaggerOptions.apis);
const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpec));

const frontendDir = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendDir));

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ success: false, error: 'Endpunkt nicht gefunden.' });
  }
  return res.status(404).sendFile(path.join(frontendDir, '404.html'));
});

app.use((err, req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.error('[Unhandled error]', err);
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, error: 'Ungültiges JSON im Request-Body.' });
  }
  return res.status(500).json({ success: false, error: 'Interner Serverfehler.' });
});

async function start() {
  try {
    await testConnection();
  } catch (err) {
    console.error('Serverstart fehlgeschlagen – keine Datenbankverbindung:', err.message);
    console.error('Läuft der MySQL-Server und stimmen die Zugangsdaten in der .env?');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`StudyWork-Server läuft auf http://localhost:${PORT}`);
    }
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} ist bereits belegt. Beende den anderen Prozess (z. B. \`lsof -ti:${PORT} | xargs kill\`) oder setze einen anderen PORT in der .env.`);
    } else {
      console.error('Serverstart fehlgeschlagen:', err.message);
    }
    process.exit(1);
  });
}

start();

module.exports = app;

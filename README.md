# StudyWork – Jobplattform für Studenten

StudyWork ist eine Web-Applikation, auf der **Unternehmen** Studentenjobs ausschreiben
und **Studenten** sich direkt darauf bewerben können – mit Login-System, Profilen,
Lebenslauf-Upload und Bewerbungsverwaltung. Das Projekt entstand im Rahmen des Moduls
*Internettechnologien* (Hochschule Kempten).

| Schicht   | Technologie |
|-----------|-------------|
| Frontend  | HTML, CSS, Vanilla JavaScript (kein Framework) |
| Backend   | Node.js + Express – selbst geschriebener Webserver mit REST-API |
| Datenbank | MySQL – Zugriff über `mysql2` (Connection Pool, Prepared Statements) |

Frontend und API laufen auf **demselben Port** (Express liefert `frontend/` statisch
aus) – dadurch gibt es keine CORS-Probleme und einen einzigen Startbefehl.

---

## Inhalt

1. [Voraussetzungen](#1-voraussetzungen)
2. [Installation & Start](#2-installation--start)
3. [Demo-Zugänge](#3-demo-zugänge)
4. [Projektstruktur](#4-projektstruktur)
5. [Umgebungsvariablen](#5-umgebungsvariablen)
6. [Architektur-Überblick](#6-architektur-überblick)
7. [REST-API](#7-rest-api)
8. [Authentifizierung & Sicherheit](#8-authentifizierung--sicherheit)
9. [Datenmodell](#9-datenmodell)
10. [Funktionsumfang](#10-funktionsumfang)
11. [Fehlerbehebung](#11-fehlerbehebung)
12. [Bewusste Einschränkungen (MVP)](#12-bewusste-einschränkungen-mvp)
13. [Weiterführende Dokumentation](#13-weiterführende-dokumentation)

---

## 1. Voraussetzungen

| Software | Version | Prüfen mit |
|----------|---------|------------|
| Node.js  | ≥ 18 (getestet mit 22) | `node --version` |
| npm **oder** pnpm | npm ≥ 9 / pnpm ≥ 9 | `npm --version` / `pnpm --version` |
| MySQL    | ≥ 8 (getestet mit 9.6) | `mysql --version` |

Der MySQL-Server muss laufen, z. B. unter macOS (Homebrew):

```bash
brew services start mysql
```

Unter Windows/Linux: MySQL als Dienst starten (XAMPP, MySQL Installer o. Ä.).

---

## 2. Installation & Start

Alle Befehle vom **Projekt-Root** aus (dem Ordner mit dieser README):

```bash
# 1) Umgebungsdatei aus der Vorlage anlegen
cp .env.example .env
#    → bei Bedarf DB-Zugangsdaten in .env anpassen (siehe Abschnitt 5)

# 2) MySQL-Benutzer anlegen (einmalig, als root)
mysql -u root -e "CREATE USER IF NOT EXISTS 'studywork'@'localhost' IDENTIFIED BY 'changeme'; \
  GRANT ALL PRIVILEGES ON studywork.* TO 'studywork'@'localhost'; FLUSH PRIVILEGES;"

# 3) Datenbank + Tabellen + Beispieldaten anlegen
#    (--default-character-set=utf8mb4 stellt korrekte Umlaute sicher)
mysql --default-character-set=utf8mb4 -u root < backend/db_setup.sql

# 4) Abhängigkeiten installieren und starten (im backend/-Ordner)
cd backend
npm install        # alternativ: pnpm install
npm start          # alternativ: pnpm start
```

Danach ist die Anwendung erreichbar unter **http://localhost:3000**
(API-Dokumentation: **http://localhost:3000/api-docs**).

Für die Entwicklung mit automatischem Neustart bei Code-Änderungen:

```bash
npm run dev        # nutzt den eingebauten --watch-Modus von Node.js
```

**Hinweise:**
- `package.json` liegt in `backend/` → `install`/`start` dort ausführen.
  Die `.env` liegt im **Projekt-Root** und wird automatisch von dort geladen.
- `backend/db_setup.sql` ist **idempotent**: Erneutes Ausführen setzt die Datenbank
  auf den frischen Ausgangszustand zurück (eigene Testdaten gehen dabei verloren).

---

## 3. Demo-Zugänge

Alle Seed-Konten nutzen das Passwort **`studywork123`**. Beim Login die passende
**Rolle** (Student/Unternehmen) wählen.

| Rolle       | E-Mail                        |
|-------------|-------------------------------|
| Unternehmen | `kontakt@technova.de`         |
| Unternehmen | `jobs@greenleaf.de`           |
| Unternehmen | `hr@campusmedia.de`           |
| Unternehmen | `jobs@pixelforge.de`          |
| Unternehmen | `karriere@blueocean.de`       |
| Unternehmen | `team@mediconnect.de`         |
| Student     | `lena.hofmann@uni-berlin.de`  |

Die Beispieldaten enthalten außerdem 20 Stellenanzeigen (17 aktiv), 5 Bewerbungen
und einen Job-Alert. *Lena Hofmann* eignet sich gut zum Vorführen: ausgefülltes
Profil, laufende Bewerbung bei TechNova, gespeicherter Job-Alert.

---

## 4. Projektstruktur

```
studywork/
├── .env.example            # Vorlage für Umgebungsvariablen
├── .gitignore              # schließt node_modules/, .env u. a. aus
├── README.md               # diese Datei (Installation + technische Doku)
│
├── docs/
│   └── erklaerungen/       # ausführliche HTML-Erklärungen (im Browser öffnen)
│       ├── index.html      #   Überblick: wie alles zusammenspielt
│       ├── frontend.html   #   Frontend im Detail
│       ├── backend.html    #   Backend & REST-API im Detail
│       ├── datenbank.html  #   Datenbank inkl. UML-Beschreibung
│       └── prof-fragen.html#   Fragenkatalog mit Antworten
│
├── backend/
│   ├── server.js           # Einstiegspunkt: Express, Middleware, Routen, Swagger
│   ├── db.js               # MySQL-Verbindung (Connection Pool, Start-Check)
│   ├── auth.js             # Passwort-Hashing (scrypt), Sessions, Rechte-Middleware
│   ├── helpers.js          # einheitliche Antworten + Eingabe-Validierung
│   ├── db_setup.sql        # Schema + Beispieldaten (idempotent)
│   ├── package.json        # Abhängigkeiten & Skripte (start / dev)
│   └── routes/
│       ├── jobs.js         # Stellenanzeigen (inkl. Melden)
│       ├── applications.js # Bewerbungen
│       ├── companies.js    # Unternehmen
│       ├── auth.js         # Registrierung / Login / Logout / Session
│       └── students.js     # Studenten-Profil, Lebenslauf, Job-Alerts
│
└── frontend/
    ├── index.html              # Startseite (Schnellsuche, neueste Jobs)
    ├── jobs.html               # Jobsuche mit Filtern & Sortierung
    ├── job-detail.html         # Jobdetail + Bewerbungsformular
    ├── company-dashboard.html  # Unternehmens-Dashboard (Login nötig)
    ├── profile.html            # Studenten-Profil, CV, Bewerbungen, Alerts
    ├── login.html              # Anmelden (Rolle wählbar)
    ├── register.html           # Konto erstellen (Rolle wählbar)
    ├── 404.html                # Fehlerseite
    ├── css/style.css           # komplettes Design-System inkl. Dark-Mode
    └── js/
        ├── api.js          # zentraler API-Client, Navigation, UI-Helfer
        ├── jobs.js         # Logik Jobsuche + Jobdetail
        ├── company.js      # Logik Unternehmens-Dashboard
        ├── auth.js         # Logik Login & Registrierung
        └── profile.js      # Logik Studenten-Profil
```

---

## 5. Umgebungsvariablen

Alle Variablen stehen in `.env` (Vorlage: `.env.example`). Die echte `.env` wird
**nicht** eingecheckt (`.gitignore`) – Secrets landen nie im Repository.

| Variable      | Beispiel      | Bedeutung |
|---------------|---------------|-----------|
| `PORT`        | `3000`        | Port des Express-Servers (Frontend + API) |
| `DB_HOST`     | `localhost`   | Host des MySQL-Servers |
| `DB_PORT`     | `3306`        | Port des MySQL-Servers |
| `DB_USER`     | `studywork`   | MySQL-Benutzername |
| `DB_PASSWORD` | `changeme`    | MySQL-Passwort (nur in `.env`, nie im Code) |
| `DB_NAME`     | `studywork`   | Name der Datenbank |
| `NODE_ENV`    | `development` | `development` oder `production` (steuert Debug-Logs) |

---

## 6. Architektur-Überblick

```
Browser (Frontend)          Node.js/Express (Backend)          MySQL (Datenbank)
──────────────────          ─────────────────────────          ─────────────────
HTML/CSS/JS         fetch   REST-API unter /api/v1     SQL     6 Tabellen
Seiten + api.js   ────────► validiert, prüft Rechte  ────────► (Prepared
zeigt Daten an    ◄──────── antwortet als JSON       ◄──────── Statements)
                   JSON
```

- Der Browser redet **nie direkt** mit der Datenbank – ausschließlich das Backend.
- Jeder Route-Handler folgt demselben Muster: Eingaben validieren → Rechte prüfen →
  Datenbank-Zugriff → einheitliche JSON-Antwort; alles in `try/catch`.
- Beim Start prüft der Server zuerst die DB-Verbindung und öffnet erst dann den Port.

---

## 7. REST-API

Basis-URL: `http://localhost:3000/api/v1`

> **Interaktive Swagger/OpenAPI-Dokumentation:** bei laufendem Server unter
> **http://localhost:3000/api-docs** (rohe Spezifikation: `/api-docs.json`).
> Alle **33 Endpunkte** sind dokumentiert; geschützte tragen ein
> **Schloss-Symbol** (Security-Scheme `cookieAuth`). Für „Try it out" einfach
> zuerst über `POST /auth/login` mit einem Demo-Konto anmelden – das
> Session-Cookie wird dann automatisch mitgeschickt. Die Doku wird per
> `swagger-jsdoc` + `swagger-ui-express` aus `@swagger`-Kommentaren direkt
> über den Route-Handlern erzeugt.

**Einheitliches Antwortformat** (alle Endpunkte):

```json
{ "success": true,  "data": { } }
{ "success": false, "error": "Verständliche Fehlermeldung" }
```

**Statuscodes:** `200` OK · `201` Created · `400` fehlerhafte Eingabe ·
`401` nicht eingeloggt · `403` keine Berechtigung · `404` nicht gefunden ·
`500` interner Fehler.

Endpunkte mit 🔒 erfordern eine aktive Login-Session (HttpOnly-Cookie
`sw_session`) der angegebenen Rolle und wirken nur auf **eigene** Daten
(Ownership-Prüfung).

### Authentifizierung – `/auth`

| Methode | Endpunkt         | Beschreibung |
|---------|------------------|--------------|
| POST    | `/auth/register` | Konto erstellen (`role`: `student`/`company`) + automatischer Login (→ 201) |
| POST    | `/auth/login`    | Anmelden (`role`, `email`, `password`) |
| POST    | `/auth/logout`   | Abmelden (Session beenden) |
| GET     | `/auth/me`       | Aktuell angemeldeter Nutzer oder `null` |

### Stellenanzeigen – `/jobs`

| Methode | Endpunkt           | Beschreibung |
|---------|--------------------|--------------|
| GET     | `/jobs`            | Alle Jobs (Filter: `title`, `location`, `job_type`, `company_id`, `status`) |
| GET     | `/jobs/:id`        | Einzelnen Job abrufen |
| POST    | `/jobs`            | 🔒 Unternehmen: Job erstellen (→ 201) |
| PUT     | `/jobs/:id`        | 🔒 Unternehmen: eigenen Job vollständig aktualisieren |
| PATCH   | `/jobs/:id`        | 🔒 Unternehmen: eigenen Job teilweise ändern (z. B. `status`) |
| DELETE  | `/jobs/:id`        | 🔒 Unternehmen: eigenen Job löschen |
| POST    | `/jobs/:id/report` | Anzeige melden (öffentlich; Grund: `fake`/`spam`/`abgelaufen`/`unangemessen`/`sonstiges`) |

### Bewerbungen – `/applications`

| Methode | Endpunkt            | Beschreibung |
|---------|---------------------|--------------|
| GET     | `/applications`     | 🔒 Unternehmen: Bewerbungen auf eigene Jobs (Filter: `job_id`) |
| GET     | `/applications/:id` | 🔒 Unternehmen: einzelne Bewerbung (nur eigene) |
| POST    | `/applications`     | Bewerbung einreichen (→ 201, **auch ohne Konto** möglich) |
| PATCH   | `/applications/:id` | 🔒 Unternehmen: Status ändern (`offen`/`gesehen`/`angenommen`/`abgelehnt`) |
| DELETE  | `/applications/:id` | 🔒 Unternehmen: Bewerbung löschen |

Serverseitige Regeln bei `POST /applications`: Bewerbungen auf nicht-aktive
Stellen und Doppelbewerbungen (gleiche E-Mail + Stelle) werden mit 400
abgelehnt; der Status startet **immer** bei `offen`.

### Unternehmen – `/companies`

| Methode | Endpunkt         | Beschreibung |
|---------|------------------|--------------|
| GET     | `/companies`     | Alle Unternehmen (ohne Passwort-Hash) |
| GET     | `/companies/:id` | Einzelnes Unternehmen |
| POST    | `/companies`     | Unternehmen anlegen (→ 201; login-fähige Konten entstehen über `/auth/register`) |
| PUT     | `/companies/:id` | 🔒 Eigenes Profil aktualisieren |
| DELETE  | `/companies/:id` | 🔒 Eigenes Konto löschen (kaskadiert auf Jobs + Bewerbungen) |

### Studenten – `/students`

| Methode | Endpunkt                    | Beschreibung |
|---------|-----------------------------|--------------|
| GET     | `/students/me`              | 🔒 Student: eigenes Profil |
| PUT     | `/students/me`              | 🔒 Student: Profil bearbeiten (Über mich, Skills, Sichtbarkeit …) |
| GET     | `/students/me/applications` | 🔒 Student: eigene Bewerbungen samt Status |
| GET     | `/students/me/alerts`       | 🔒 Student: Job-Alerts inkl. Trefferzahl + passenden Jobs |
| POST    | `/students/me/alerts`       | 🔒 Student: Job-Alert aus Suchkriterien anlegen |
| DELETE  | `/students/me/alerts/:id`   | 🔒 Student: Job-Alert löschen |
| PUT     | `/students/me/cv`           | 🔒 Student: Lebenslauf hochladen/ersetzen (PDF, base64, max. 3 MB) |
| DELETE  | `/students/me/cv`           | 🔒 Student: Lebenslauf entfernen |
| DELETE  | `/students/me`              | 🔒 Student: eigenes Konto löschen (inkl. eigener Bewerbungen) |
| GET     | `/students/:id`             | Profil ansehen – zugriffskontrolliert (siehe unten) |
| GET     | `/students/:id/cv`          | Lebenslauf (PDF) laden – gleiche Zugriffskontrolle |

**Profil-Sichtbarkeit:** Jeder Student wählt `profile_visibility = applied`
(nur Unternehmen, bei denen er sich beworben hat) oder `all` (alle eingeloggten
Unternehmen). Andere Zugriffe → 401/403.

### System

| Methode | Endpunkt  | Beschreibung |
|---------|-----------|--------------|
| GET     | `/health` | Verfügbarkeits-Check (`{status:"ok"}`) |

### Beispiel-Aufrufe (curl)

```bash
# Alle aktiven Werkstudenten-Jobs in Berlin
curl "http://localhost:3000/api/v1/jobs?job_type=Werkstudent&location=Berlin&status=aktiv"

# Bewerbung einreichen (ohne Konto möglich)
curl -X POST http://localhost:3000/api/v1/applications \
  -H "Content-Type: application/json" \
  -d '{"job_id":1,"student_name":"Lisa Muster","student_email":"lisa@uni.de","cover_letter":"Hallo!"}'

# Als Unternehmen anmelden (Session-Cookie in Datei speichern)
curl -c cookies.txt -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"role":"company","email":"kontakt@technova.de","password":"studywork123"}'

# 🔒 Bewerbungsstatus ändern (mit Session-Cookie)
curl -b cookies.txt -X PATCH http://localhost:3000/api/v1/applications/1 \
  -H "Content-Type: application/json" -d '{"status":"gesehen"}'
```

---

## 8. Authentifizierung & Sicherheit

Login/Registrierung sind **ohne externen Auth-Provider** umgesetzt (nur
Node-Bordmittel, `backend/auth.js`):

- **Passwörter:** scrypt-Hash mit zufälligem Salt (`scrypt:salt:hash`), Vergleich
  zeitkonstant (`timingSafeEqual`). Klartext-Passwörter existieren nirgends.
- **Sessions:** 32-Byte-Zufalls-Token, serverseitig gespeichert, an den Browser als
  **HttpOnly + SameSite-Cookie** (`sw_session`, 7 Tage). JavaScript kann das Cookie
  nicht lesen; Logout löscht die Session serverseitig.
- **Rollen & Ownership:** Middleware `requireCompany`/`requireStudent` schützt die
  Routen; zusätzlich prüft jede Route, dass nur **eigene** Daten gelesen/geändert
  werden (sonst 403). Login-Fehler verraten nicht, ob die E-Mail existiert.

Weitere Schutzmaßnahmen:

| Risiko | Maßnahme |
|--------|----------|
| SQL-Injection | ausschließlich Prepared Statements (`pool.execute` mit `?`-Parametern) |
| XSS | alle Fremdtexte werden im Frontend vor dem Einfügen escaped (`escapeHtml`) |
| Session-Diebstahl | HttpOnly + SameSite-Cookie |
| Secrets im Code | nur in `.env` (gitignored) |
| Fehleingaben | doppelte Validierung (Client + Server) inkl. Längenlimits → klare 400-Meldungen |
| Abstürze | `try/catch` in jedem Handler; zentrale Fehler-Handler; DB-Check vor Serverstart |

---

## 9. Datenmodell

Sechs Tabellen in der MySQL-Datenbank `studywork` (Schema: `backend/db_setup.sql`):

```
COMPANY  1 ───<  0..*  JOB
JOB      1 ───<  0..*  APPLICATION
JOB      1 ───<  0..*  JOB_REPORT
STUDENT  1 ───<  0..*  JOB_ALERT
STUDENT  0..1 ┄┄< 0..* APPLICATION   (logisch über gleiche E-Mail, kein FK)
```

- **companies** – Unternehmen (Login, Profil)
- **students** – Studenten (Login, „Über mich"-Profil, Lebenslauf als base64-PDF,
  Sichtbarkeits-Einstellung)
- **jobs** – Stellenanzeigen (FK `company_id`; ENUMs für Typ und Status)
- **applications** – Bewerbungen (FK `job_id`; Name/E-Mail als Text → Bewerben ohne
  Konto möglich, Zuordnung zum Konto „weich" über die E-Mail)
- **job_reports** – Meldungen zu Anzeigen (FK `job_id`)
- **job_alerts** – gespeicherte Suchen (FK `student_id`)

Alle Fremdschlüssel mit `ON DELETE CASCADE`; Indizes auf den Filter-Spalten;
Zeichensatz `utf8mb4`. Die vollständige Beschreibung (alle Felder, UML in Worten
mit Multiplizitäten) steht in `docs/erklaerungen/datenbank.html`.

---

## 10. Funktionsumfang

**Studenten**
- Jobsuche mit Live-Filtern (Stichwort, Ort, Anstellungsart), „Nur Remote",
  Sortierung, teilbaren Filter-URLs und Merkliste (Herz, lokal gespeichert)
- Jobdetail mit Unternehmensprofil und „weiteren Jobs des Unternehmens"
- Bewerben mit und ohne Konto (Validierung client- + serverseitig,
  Doppelbewerbungs-Schutz, „Bereits beworben"-Hinweis)
- Profil „Über mich" (Headline, Bio, Skills, Studiengang …) mit einstellbarer
  Sichtbarkeit und Vorschau der Außenansicht
- Lebenslauf-Upload (PDF), „Meine Bewerbungen" mit Status, Job-Alerts mit
  passenden Treffern (E-Mail-Versand simuliert), Konto löschen

**Unternehmen**
- Login-gebundenes Dashboard mit Statistiken
- Anzeigen erstellen/bearbeiten/löschen + Schnell-Statuswechsel
- Bewerbungen einsehen (Statusfilter-Chips), Status ändern, löschen,
  E-Mail kopieren, Bewerber-Profil samt Lebenslauf ansehen (zugriffskontrolliert)
- Unternehmensprofil bearbeiten, Konto löschen (kaskadiert)

**Allgemein**
- Responsive (Handy/Tablet/Desktop), Light-/Dark-Mode, „Neu"-Badges, relative
  Datumsangaben, Skeleton-Loader, Empty States, Toast-/Flash-Meldungen,
  „Job melden", Tastatur-Shortcut „/", Barrierefreiheit (ARIA, Fokus-Management)

---

## 11. Fehlerbehebung

| Problem | Ursache / Lösung |
|---------|------------------|
| `Serverstart fehlgeschlagen – keine Datenbankverbindung` | MySQL läuft nicht oder Zugangsdaten in `.env` falsch. |
| `Unknown database 'studywork'` | Schritt 3 der Installation fehlt (`db_setup.sql` importieren). |
| `Access denied for user 'studywork'` | Schritt 2 wiederholen (Benutzer anlegen) oder `.env` prüfen. |
| Umlaute falsch dargestellt | Import mit `--default-character-set=utf8mb4` wiederholen. |
| Port 3000 belegt | Anderen `PORT` in `.env` setzen oder blockierenden Prozess beenden (`lsof -ti:3000 \| xargs kill`). |
| API meldet `Endpunkt nicht gefunden` nach Code-Änderung | Alter Server-Prozess läuft noch – neu starten (bzw. `npm run dev` nutzen). |
| pnpm: `ERR_PNPM_IGNORED_BUILDS` | Bereits gelöst über `backend/pnpm-workspace.yaml` – `pnpm install` erneut ausführen. Starten mit `pnpm start` (nicht `pnpm start dev`). |

---

## 12. Bewusste Einschränkungen (MVP)

- **Sessions im Arbeitsspeicher:** Nach einem Server-Neustart ist eine erneute
  Anmeldung nötig (dokumentierte Vereinfachung; produktiv: Sessions in DB/Redis).
- **Job-Alert-E-Mails werden simuliert** (UI-Hinweis + Server-Log) – bewusst kein
  Mailserver angebunden.
- **Lebenslauf in der DB** (base64, ≤ 3 MB) statt Dateiserver – für die Demo-Größe
  ausreichend und ohne Zusatz-Infrastruktur.
- **Kein Deployment:** Die App läuft lokal (`localhost:3000`); das war so vorgesehen.

---

## 13. Weiterführende Dokumentation

- **`docs/erklaerungen/index.html`** (im Browser öffnen, kein Server nötig):
  ausführliche, auch für Fachfremde verständliche Erklärungen zu Frontend,
  Backend und Datenbank – inkl. UML-Beschreibung, Glossaren und einem
  Fragenkatalog (`prof-fragen.html`).
- **Swagger UI** unter `http://localhost:3000/api-docs` (bei laufendem Server):
  alle Endpunkte interaktiv testen.

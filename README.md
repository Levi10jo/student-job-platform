# StudyWork – Jobplattform für Studierende

StudyWork ist eine schlanke Web-Applikation, auf der **Unternehmen** Studentenjobs
ausschreiben und **Studierende** sich direkt darauf bewerben können. Das Projekt
entstand im Rahmen des Moduls *Internettechnologien*.

- **Frontend:** HTML, CSS, Vanilla JavaScript
- **Backend:** Node.js mit Express (REST-API)
- **Datenbank:** MySQL (Zugriff über `mysql2`, Connection Pool, Prepared Statements)

Frontend und API laufen auf **demselben Port** – Express liefert die statischen
Dateien aus `frontend/` aus. Dadurch entstehen keine CORS-Probleme.

---

## 1. Voraussetzungen

| Software | Empfohlene Version | Prüfen mit |
|----------|--------------------|------------|
| Node.js  | ≥ 18 (getestet mit 22) | `node --version` |
| npm      | ≥ 9                | `npm --version` |
| MySQL    | ≥ 8 (getestet mit 9.6) | `mysql --version` |

Der MySQL-Server muss laufen. Unter macOS (Homebrew) z. B.:

```bash
brew services start mysql
```

---

## 2. Schnellstart (in unter 10 Minuten)

```bash
# 1. Projekt holen (oder ZIP entpacken) und hineinwechseln
cd studywork

# 2. Umgebungsdatei aus der Vorlage anlegen
cp .env.example .env
#    -> bei Bedarf DB-Zugangsdaten in .env anpassen (siehe Abschnitt 4)

# 3. Datenbank-Benutzer anlegen (einmalig, als MySQL-Admin/root)
mysql -u root -e "CREATE USER IF NOT EXISTS 'studywork'@'localhost' IDENTIFIED BY 'changeme'; \
  GRANT ALL PRIVILEGES ON studywork.* TO 'studywork'@'localhost'; FLUSH PRIVILEGES;"

# 4. Datenbankschema + Beispieldaten importieren
#    (--default-character-set=utf8mb4 stellt korrekte Umlaute sicher)
mysql --default-character-set=utf8mb4 -u root < backend/db_setup.sql

# 5. Abhängigkeiten installieren und Server starten
cd backend
npm install
npm start
```

Anschließend ist die Anwendung erreichbar unter:

> **http://localhost:3000**

**Demo-Zugangsdaten** (alle Seed-Konten nutzen das Passwort `studywork123`):

| Rolle | E-Mail | Passwort |
|-------|--------|----------|
| Unternehmen | `kontakt@technova.de` | `studywork123` |
| Unternehmen | `jobs@greenleaf.de` | `studywork123` |
| Unternehmen | `hr@campusmedia.de` | `studywork123` |
| Student:in | `lena.hofmann@uni-berlin.de` | `studywork123` |

> **Hinweis:** Die Datei `package.json` liegt im Ordner `backend/`. `npm install`
> und `npm start` müssen daher aus `backend/` heraus ausgeführt werden. Die Datei
> `.env` liegt dagegen im **Projekt-Root** und wird vom Server automatisch von dort
> geladen.

Für die Entwicklung mit automatischem Neustart bei Dateiänderungen:

```bash
npm run dev   # nutzt den eingebauten --watch-Modus von Node.js
```

---

## 3. Projektstruktur

```
studywork/
├── .env.example            # Vorlage für Umgebungsvariablen
├── .gitignore              # ignoriert node_modules/, .env, Extra/ …
├── README.md               # diese Datei (technische Doku / Setup)
│
├── backend/
│   ├── server.js           # Express-Server + statisches Frontend
│   ├── db.js               # MySQL-Verbindung (Connection Pool)
│   ├── helpers.js          # gemeinsame Response-/Validierungs-Helfer
│   ├── db_setup.sql        # Schema + Beispieldaten (idempotent)
│   ├── package.json
│   └── routes/
│       ├── jobs.js         # CRUD für Stellenanzeigen
│       ├── applications.js # CRUD für Bewerbungen
│       └── companies.js    # CRUD für Unternehmen
│
└── frontend/
    ├── index.html              # Landingpage
    ├── jobs.html               # Jobsuche (Studierenden-Sicht)
    ├── job-detail.html         # Jobdetail + Bewerbungsformular
    ├── company-dashboard.html  # Unternehmens-Dashboard
    ├── 404.html                # Fehlerseite
    ├── css/style.css           # Design-System inkl. Dark Mode
    └── js/
        ├── api.js          # zentraler API-Client + UI-Helfer
        ├── jobs.js         # Logik der Studierenden-Sicht
        └── company.js      # Logik des Unternehmens-Dashboards
```

---

## 4. Umgebungsvariablen

Alle Variablen werden in `.env` gesetzt (Vorlage: `.env.example`). Die echte
`.env` wird **nicht** eingecheckt (steht in `.gitignore`).

| Variable      | Beispiel      | Bedeutung |
|---------------|---------------|-----------|
| `PORT`        | `3000`        | Port des Express-Servers (Frontend + API) |
| `DB_HOST`     | `localhost`   | Host des MySQL-Servers |
| `DB_PORT`     | `3306`        | Port des MySQL-Servers |
| `DB_USER`     | `studywork`   | MySQL-Benutzername |
| `DB_PASSWORD` | `changeme`    | MySQL-Passwort (nur in `.env`, nie im Code!) |
| `DB_NAME`     | `studywork`   | Name der Datenbank |
| `NODE_ENV`    | `development` | `development` oder `production` (steuert Debug-Logs) |

---

## 5. REST-API – Überblick

Basis-URL: `http://localhost:3000/api/v1`

> **Interaktive Swagger-/OpenAPI-Doku:** Bei laufendem Server unter
> **http://localhost:3000/api-docs** erreichbar (die rohe OpenAPI-Spec unter
> `/api-docs.json`). Sie wird mit `swagger-ui-express` + `swagger-jsdoc` aus den
> `@swagger`-Kommentaren über den Route-Handlern erzeugt und dokumentiert die
> GET-/POST-Endpunkte von Jobs, Bewerbungen, Unternehmen und Auth (inkl.
> „Try it out").

Alle Antworten sind JSON im einheitlichen Format:

```json
{ "success": true,  "data": { /* … */ } }
{ "success": false, "error": "Verständliche Fehlermeldung" }
```

### Authentifizierung (`/auth`)

Login und Registrierung sind ohne externen Auth-Provider umgesetzt:
Passwörter werden mit **scrypt** (Node-`crypto`) gehasht, die Session läuft
über ein **HttpOnly-Cookie** (`sw_session`). Mit 🔒 markierte Endpunkte
weiter unten erfordern eine aktive **Unternehmens-Session** und wirken nur
auf eigene Daten (Ownership-Check).

| Methode | Endpunkt          | Beschreibung |
|---------|-------------------|--------------|
| POST    | `/auth/register`  | Konto erstellen (`role`: `student` oder `company`) + automatischer Login (→ 201) |
| POST    | `/auth/login`     | Anmelden (`role`, `email`, `password`) |
| POST    | `/auth/logout`    | Abmelden (Session beenden) |
| GET     | `/auth/me`        | Aktuell angemeldete:r Nutzer:in oder `null` |

### Stellenanzeigen (`/jobs`)

| Methode | Endpunkt        | Beschreibung |
|---------|-----------------|--------------|
| GET     | `/jobs`         | Alle Jobs (Filter: `title`, `location`, `job_type`, `company_id`, `status`) |
| GET     | `/jobs/:id`     | Einzelnen Job abrufen |
| POST    | `/jobs`         | 🔒 Job erstellen (→ 201) |
| PUT     | `/jobs/:id`     | 🔒 Job vollständig aktualisieren |
| PATCH   | `/jobs/:id`     | 🔒 Job teilweise aktualisieren (z. B. nur `status`) |
| DELETE  | `/jobs/:id`     | 🔒 Job löschen |
| POST    | `/jobs/:id/report` | Stellenanzeige melden (öffentlich; Grund: fake/spam/abgelaufen/unangemessen/sonstiges) |

### Bewerbungen (`/applications`)

| Methode | Endpunkt              | Beschreibung |
|---------|-----------------------|--------------|
| GET     | `/applications`       | 🔒 Eigene Bewerbungen (Filter: `job_id`) |
| GET     | `/applications/:id`   | 🔒 Einzelne Bewerbung |
| POST    | `/applications`       | Bewerbung einreichen (→ 201, auch ohne Konto möglich) |
| PATCH   | `/applications/:id`   | 🔒 Status ändern (`offen`/`gesehen`/`angenommen`/`abgelehnt`) |
| DELETE  | `/applications/:id`   | 🔒 Bewerbung löschen |

> Serverseitige Regeln bei `POST /applications`: Bewerbungen auf nicht-aktive
> Stellen sowie doppelte Bewerbungen (gleiche E-Mail für dieselbe Stelle) werden
> mit Status 400 und verständlicher Fehlermeldung abgelehnt.
> Da Bewerbungen personenbezogene Daten enthalten, kann sie nur das Unternehmen
> lesen und verwalten, dem die zugehörige Stelle gehört.

### Unternehmen (`/companies`)

| Methode | Endpunkt            | Beschreibung |
|---------|---------------------|--------------|
| GET     | `/companies`        | Alle Unternehmen |
| GET     | `/companies/:id`    | Einzelnes Unternehmen |
| POST    | `/companies`        | Unternehmen anlegen (→ 201; ohne Login-Konto – login-fähige Konten entstehen über `/auth/register`) |
| PUT     | `/companies/:id`    | 🔒 Eigenes Unternehmen aktualisieren |
| DELETE  | `/companies/:id`    | 🔒 Eigenes Unternehmen löschen (inkl. zugehöriger Jobs/Bewerbungen) |

### Studierenden-Profile (`/students`)

| Methode | Endpunkt          | Beschreibung |
|---------|-------------------|--------------|
| GET     | `/students/me`    | 🔒 Eigenes Profil (Studierenden-Login) |
| PUT     | `/students/me`    | 🔒 Eigenes Profil bearbeiten (Über mich, Skills, Sichtbarkeit …) |
| GET     | `/students/me/applications` | 🔒 Eigene Bewerbungen samt Status |
| GET     | `/students/me/alerts` | 🔒 Eigene Job-Alerts inkl. Trefferzahl + passende Jobs |
| POST    | `/students/me/alerts` | 🔒 Job-Alert aus Suchkriterien anlegen |
| DELETE  | `/students/me/alerts/:id` | 🔒 Job-Alert löschen |
| PUT     | `/students/me/cv` | 🔒 Lebenslauf (PDF, base64) hochladen/ersetzen |
| DELETE  | `/students/me/cv` | 🔒 Lebenslauf entfernen |
| DELETE  | `/students/me`    | 🔒 Eigenes Konto löschen (inkl. eigener Bewerbungen) |
| GET     | `/students/:id`   | Profil ansehen – nur mit Zugriff (siehe unten) |
| GET     | `/students/:id/cv` | Lebenslauf (PDF) herunterladen – gleiche Zugriffskontrolle wie das Profil |

> **Sichtbarkeit:** Jedes Profil hat eine Einstellung `profile_visibility`
> (`applied` oder `all`). `GET /students/:id` liefert das Profil nur, wenn der
> Abrufende es selbst ist, **oder** ein Unternehmen ist, bei dem sich die Person
> beworben hat, **oder** das Profil auf „alle Unternehmen" (`all`) steht.
> Andernfalls antwortet der Server mit 403/401.

> Zusätzlich: `GET /api/v1/health` als einfacher Verfügbarkeits-Check.

### Beispiel-Aufrufe (curl)

```bash
# Alle Werkstudenten-Jobs in Berlin
curl "http://localhost:3000/api/v1/jobs?job_type=Werkstudent&location=Berlin"

# Neue Bewerbung einreichen
curl -X POST http://localhost:3000/api/v1/applications \
  -H "Content-Type: application/json" \
  -d '{"job_id":1,"student_name":"Lisa Muster","student_email":"lisa@uni.de","cover_letter":"Hallo!"}'

# Als Unternehmen anmelden (Session-Cookie in Datei speichern)
curl -c cookies.txt -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"role":"company","email":"kontakt@technova.de","password":"studywork123"}'

# Bewerbungsstatus ändern (🔒 benötigt das Session-Cookie)
curl -b cookies.txt -X PATCH http://localhost:3000/api/v1/applications/1 \
  -H "Content-Type: application/json" \
  -d '{"status":"angenommen"}'
```

---

## 6. Funktionsumfang

**Konto & Anmeldung**
- **Registrierung** wahlweise als Student:in oder Unternehmen (Rollen-Umschalter)
- **Login/Logout** mit Session-Cookie; der Anmeldestatus ist in der Navigation sichtbar
- Passwörter werden ausschließlich **gehasht** gespeichert (scrypt + Salt)

**Studierende**
- Jobübersicht mit **Live-Suche** (Titel, Ort, Anstellungsart) und **Sortierung**
  (neueste/älteste/Titel); Filter werden in der URL gespeichert → teilbare Links
- Es werden nur **aktive** Stellen angezeigt; die Landingpage zeigt die neuesten Jobs
- Detailseite je Stelle mit vollständiger Beschreibung, **Unternehmensprofil**
  (Beschreibung + Website) und „Weitere Jobs des Unternehmens"
- Bewerbungsformular mit client- und serverseitiger Validierung, Zeichenzähler
  und optionalem Merken von Name/E-Mail für die nächste Bewerbung (lokal im Browser);
  eingeloggte Studierende bekommen Name/E-Mail automatisch vorbefüllt
- **Schutz vor Doppelbewerbungen** (gleiche E-Mail + Stelle, serverseitig geprüft)
- **Merkliste:** Jobs per Herz markieren (lokal gespeichert) und gezielt filtern
- **Profil „Über mich"** (Headline, Bio, Skills, Studiengang, Hochschule, Ort,
  Website) mit einstellbarer **Sichtbarkeit** (nur beworbene Unternehmen / alle);
  Vorschau der Außenansicht direkt aus dem Editor
- **Lebenslauf hochladen** (PDF, max. 3 MB) im Profil; Unternehmen können ihn
  über das (verknüpfte) Profil ansehen – mit derselben Zugriffskontrolle
- **„Meine Bewerbungen"**: eingeloggte Studierende sehen ihre Bewerbungen samt
  aktuellem Status; auf der Detailseite erscheint ein **„Bereits beworben"**-Hinweis
  statt des Formulars
- **Job-Alerts**: eine Suche (Stichwort/Ort/Anstellungsart) als Alert speichern.
  Ein Alert ist damit eine **gespeicherte Suche**: passend ist jede *aktive*
  Stelle, die zu den Kriterien passt – dieselbe Logik wie die Jobsuche. Auf dem
  Profil zeigt jeder Alert die Trefferzahl **und die konkret passenden Jobs**
  (neueste zuerst). Die E-Mail-Benachrichtigung wird **simuliert** (Hinweis im
  UI + Server-Log), es ist bewusst kein Mailserver angebunden
- **Konto löschen** auf der Profilseite (entfernt Profil + eigene Bewerbungen
  dauerhaft) – analog zur Konto-Löschung für Unternehmen
- Bestätigung nach erfolgreicher Bewerbung

**Unternehmen**
- Das Dashboard ist an den **Unternehmens-Login** gekoppelt (ohne Anmeldung:
  Hinweis mit Links zu Login/Registrierung)
- Unternehmensprofil bearbeiten und Konto **löschen** (inkl. aller Anzeigen/Bewerbungen)
- Stellenanzeigen erstellen, bearbeiten und löschen
- **Schnell-Statuswechsel** (aktiv/pausiert/geschlossen) direkt in der Jobliste
- Eigene Jobs samt eingegangener Bewerbungen einsehen (Bewerber-E-Mail als
  Mailto-Link, zusätzlich per Klick in die Zwischenablage kopierbar)
- **Bewerber-Profil ansehen:** Bei Bewerbungen mit StudyWork-Konto führt ein
  Link zum „Über mich"-Profil (sofern die Person es freigegeben hat)
- **Bewerbungen nach Status filtern** (offen/gesehen/angenommen/abgelehnt) mit
  Zähler-Chips; Filter blendet passende Stellen und Bewerbungen ein
- Bewerbungsstatus ändern (offen → gesehen → angenommen/abgelehnt) und einzelne
  Bewerbungen löschen

**Allgemein**
- **Job melden**: Melde-Button auf jeder Stelle (Grund + optionale Nachricht) gegen Fake/Spam
- **„Nur Remote"-Filter** und **„Neu"-Badge** (Stellen jünger als 7 Tage) in der Jobsuche
- **Schnellsuche** direkt auf der Startseite (führt zur gefilterten Jobsuche)
- **Tastatur-Shortcut „/"** springt auf der Jobsuche direkt ins Suchfeld
- **„Nach oben"-Button**, der beim Scrollen erscheint
- Job-Karten sind **komplett klickbar**; Herz-Button zum Merken liegt darüber
- Relative Datumsangaben auf Job-Karten („heute", „vor 3 Tagen")
- **Passwort anzeigen/verbergen** in Login- und Registrierungsformular
- Dezente Einblend-Animationen (respektieren `prefers-reduced-motion`)
- Responsives Layout (Mobile, Tablet, Desktop), Browser-UI im passenden Farbton (`theme-color`)
- Längen-Validierung aller Eingaben (Client `maxlength` + serverseitig) –
  überlange Eingaben ergeben eine klare Meldung statt eines Serverfehlers
- Light-/Dark-Mode (Umschalter in der Navigation)
- Skeleton-Loader, aussagekräftige Empty States, schließbare Toast-Benachrichtigungen
- **Abmelden** leitet immer zur Startseite zurück (kein geschützter Inhalt bleibt
  sichtbar) und zeigt eine Bestätigung; wichtige Aktionen mit Weiterleitung
  (Login, Registrierung, Konto löschen) geben über „Flash"-Meldungen Feedback,
  das die Navigation überlebt
- Barrierefreiheit: semantisches HTML, ARIA-Labels, Tastaturnavigation,
  Fokus-Management in Dialogen (Fokus-Falle + Rücksprung beim Schließen)

---

## 7. Screenshots

> *Platzhalter – hier können Screenshots der Hauptansichten ergänzt werden.*

| Ansicht | Datei |
|---------|-------|
| Landingpage | `docs/screenshots/01_landing.png` |
| Jobsuche | `docs/screenshots/02_jobs.png` |
| Jobdetail + Bewerbung | `docs/screenshots/03_job-detail.png` |
| Unternehmens-Dashboard | `docs/screenshots/04_dashboard.png` |

---

## 8. Fehlerbehebung

| Problem | Ursache / Lösung |
|---------|------------------|
| Registrierung/Login meldet `Endpunkt nicht gefunden` | Es läuft noch ein **alter Server-Prozess** von vor dem Code-Update (Node lädt Code nur beim Start). Server stoppen (`Ctrl+C` bzw. `lsof -ti:3000 \| xargs kill`) und `npm start` erneut ausführen. |
| `Serverstart fehlgeschlagen – keine Datenbankverbindung` | MySQL läuft nicht, oder die Zugangsdaten in `.env` stimmen nicht. |
| `Access denied for user 'studywork'` | Benutzer/Passwort prüfen bzw. Schritt 3 aus dem Schnellstart erneut ausführen. |
| `Unknown database 'studywork'` | `backend/db_setup.sql` wurde noch nicht importiert (Schritt 4). |
| Umlaute werden falsch dargestellt | Import mit `--default-character-set=utf8mb4` wiederholen. |
| Port 3000 belegt | In `.env` einen anderen `PORT` setzen. |
| `ERR_PNPM_IGNORED_BUILDS` / `pnpm start` bricht ab | Tritt mit pnpm v10/11 wegen des Telemetrie-Pakets `@scarf/scarf` auf. Ist bereits in `backend/pnpm-workspace.yaml` (`allowBuilds: '@scarf/scarf': false`) gelöst – einfach `pnpm install` erneut ausführen. Befehl zum Starten: `pnpm start` (bzw. `pnpm run dev`), **nicht** `pnpm start dev`. |

---

## 9. Hinweise

- Dies ist ein **MVP** für Lernzwecke. Login/Registrierung sind ohne externen
  Auth-Provider umgesetzt: scrypt-Passwort-Hashes (Node-`crypto`) und ein
  selbst implementierter Session-Store mit HttpOnly-Cookie.
- Sessions werden **im Arbeitsspeicher** gehalten – nach einem Server-Neustart
  ist eine erneute Anmeldung nötig (bewusste, dokumentierte Vereinfachung).
- SQL-Zugriffe erfolgen ausschließlich über **Prepared Statements**.
- Secrets gehören ausschließlich in die `.env`-Datei und niemals in den Code;
  Passwörter landen nie im Klartext in der Datenbank.

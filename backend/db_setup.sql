-- =====================================================================
-- StudyWork – Datenbank-Setup (Schema + Seed-Daten)
-- =====================================================================
-- Dieses Skript ist idempotent: es kann beliebig oft ausgeführt werden
-- und stellt jedes Mal denselben Ausgangszustand her.
--
-- Ausführen z. B. mit:
--   mysql -u root < backend/db_setup.sql
-- =====================================================================

-- Sicherstellen, dass dieser Import als UTF-8 (utf8mb4) interpretiert wird,
-- damit Umlaute (ä, ö, ü, ß) korrekt gespeichert werden – unabhängig vom
-- Standard-Charset des MySQL-Clients.
SET NAMES utf8mb4;

-- Datenbank anlegen (nur falls noch nicht vorhanden) und auswählen
CREATE DATABASE IF NOT EXISTS studywork
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE studywork;

-- ---------------------------------------------------------------------
-- Tabellen entfernen (Reihenfolge wegen Fremdschlüssel-Abhängigkeiten:
-- erst die abhängigen Kind-Tabellen, dann die Eltern-Tabellen)
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS job_reports;
DROP TABLE IF EXISTS job_alerts;
DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS companies;
DROP TABLE IF EXISTS students;

-- ---------------------------------------------------------------------
-- Tabelle: companies (Unternehmen)
-- password_hash: scrypt-Hash für den Login (Format "scrypt:salt:hash").
-- ---------------------------------------------------------------------
CREATE TABLE companies (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255),
  description TEXT,
  website VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- Tabelle: students (Studenten mit Login-Konto)
-- Bewerbungen bleiben bewusst auch ohne Konto möglich; ein Konto dient
-- dem Komfort (Vorbefüllung) und künftigen Funktionen.
-- ---------------------------------------------------------------------
CREATE TABLE students (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  -- Profilfelder ("Über mich"). Alle optional; profile_visibility steuert,
  -- welche Unternehmen das Profil sehen dürfen.
  headline VARCHAR(150),
  bio TEXT,
  skills VARCHAR(500),
  study_program VARCHAR(150),
  university VARCHAR(150),
  location VARCHAR(100),
  website VARCHAR(255),
  profile_visibility ENUM('applied','all') NOT NULL DEFAULT 'applied',
  -- Lebenslauf (PDF), für die Demo base64-kodiert direkt in der DB gespeichert.
  cv_filename VARCHAR(255),
  cv_data MEDIUMTEXT,
  cv_uploaded_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ---------------------------------------------------------------------
-- Tabelle: jobs (Stellenanzeigen)
-- ---------------------------------------------------------------------
CREATE TABLE jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_id INT NOT NULL,
  title VARCHAR(150) NOT NULL,
  description TEXT NOT NULL,
  location VARCHAR(100),
  job_type ENUM('Teilzeit','Vollzeit','Werkstudent','Praktikum','Minijob') NOT NULL,
  salary_range VARCHAR(50),
  status ENUM('aktiv','pausiert','geschlossen') DEFAULT 'aktiv',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- Tabelle: applications (Bewerbungen)
-- ---------------------------------------------------------------------
CREATE TABLE applications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  student_name VARCHAR(100) NOT NULL,
  student_email VARCHAR(100) NOT NULL,
  cover_letter TEXT,
  status ENUM('offen','gesehen','angenommen','abgelehnt') DEFAULT 'offen',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- Tabelle: job_reports (Meldungen zu Stellenanzeigen, z. B. Spam/Fake)
-- ---------------------------------------------------------------------
CREATE TABLE job_reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  job_id INT NOT NULL,
  reason VARCHAR(50) NOT NULL,
  message VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- Tabelle: job_alerts (gespeicherte Suchen für Job-Benachrichtigungen)
-- Die E-Mail-Zustellung wird im MVP nur simuliert (siehe README).
-- ---------------------------------------------------------------------
CREATE TABLE job_alerts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  student_id INT NOT NULL,
  title VARCHAR(150),
  location VARCHAR(100),
  job_type VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE
);

-- ---------------------------------------------------------------------
-- Indizes für häufige Filter-/Suchabfragen
-- ---------------------------------------------------------------------
CREATE INDEX idx_jobs_company ON jobs(company_id);
CREATE INDEX idx_jobs_type ON jobs(job_type);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_applications_job ON applications(job_id);
CREATE INDEX idx_job_reports_job ON job_reports(job_id);
CREATE INDEX idx_job_alerts_student ON job_alerts(student_id);

-- =====================================================================
-- Seed-Daten
-- =====================================================================

-- Demo-Passwort aller Seed-Konten: "studywork123" (scrypt-Hash, siehe README).
SET @demo_hash = 'scrypt:b06094fbd54c38cff81602fe8ce3c199:b040480e0e43ccae84269888a2c9f5701d4343196c174fa46031bbfb695e3af78b1b40da4ae2055ad836b1fa1dd20592500c68a8812f154b7b0cbe5653c955da';

-- --- Unternehmen (6) ---
INSERT INTO companies (name, email, password_hash, description, website) VALUES
  ('TechNova GmbH',
   'kontakt@technova.de',
   @demo_hash,
   'Softwarehaus für Cloud- und Web-Anwendungen mit Sitz in Berlin. Wir entwickeln moderne SaaS-Produkte für den Mittelstand.',
   'https://www.technova.example'),
  ('GreenLeaf Solutions',
   'jobs@greenleaf.de',
   @demo_hash,
   'Nachhaltigkeits-Beratung und Ökobilanzierung für Unternehmen. Wir helfen Firmen dabei, klimaneutral zu werden.',
   'https://www.greenleaf.example'),
  ('CampusMedia AG',
   'hr@campusmedia.de',
   @demo_hash,
   'Junges Medienunternehmen rund um studentisches Leben: Magazin, Podcast und Social-Media-Kanäle für Studenten.',
   'https://www.campusmedia.example'),
  ('PixelForge Studios',
   'jobs@pixelforge.de',
   @demo_hash,
   'Indie-Spielestudio und Software-Schmiede aus Köln. Wir entwickeln Mobile Games und interaktive Web-Erlebnisse.',
   'https://www.pixelforge.example'),
  ('BlueOcean Logistics',
   'karriere@blueocean.de',
   @demo_hash,
   'Digitale Logistik- und Supply-Chain-Lösungen mit Sitz in Hamburg. Wir bringen Transparenz in globale Lieferketten.',
   'https://www.blueocean.example'),
  ('MediConnect GmbH',
   'team@mediconnect.de',
   @demo_hash,
   'Health-Tech-Unternehmen aus München. Wir vernetzen Praxen, Kliniken und Patienten über eine sichere Plattform.',
   'https://www.mediconnect.example');

-- --- Studenten (1 Demo-Konto, mit ausgefülltem Profil) ---
INSERT INTO students
  (name, email, password_hash, headline, bio, skills, study_program, university, location, website, profile_visibility)
VALUES
  ('Lena Hofmann', 'lena.hofmann@uni-berlin.de', @demo_hash,
   'Informatikstudentin im 4. Semester · sucht Werkstudentenstelle im Backend',
   'Ich studiere Informatik an der TU Berlin und begeistere mich für saubere REST-APIs und Datenbanken. In zwei Semesterprojekten habe ich kleine Node.js-Services umgesetzt und arbeite gern im Team.',
   'JavaScript, Node.js, SQL, Git, Python, Teamarbeit',
   'Informatik (B.Sc.)', 'TU Berlin', 'Berlin',
   'https://lena-hofmann.example',
   'applied');

-- --- Stellenanzeigen (8) ---
INSERT INTO jobs (company_id, title, description, location, job_type, salary_range, status) VALUES
  (1, 'Werkstudent Softwareentwicklung (Backend)',
   'Du unterstützt unser Backend-Team beim Entwickeln von REST-APIs mit Node.js. Du schreibst sauberen Code, lernst von erfahrenen Entwicklern und bringst eigene Ideen ein. Kenntnisse in JavaScript und Git sind von Vorteil.',
   'Berlin', 'Werkstudent', '16–20 €/h', 'aktiv'),
  (1, 'Praktikum Data Science',
   'Sechsmonatiges Pflicht- oder freiwilliges Praktikum im Bereich Datenanalyse. Du arbeitest mit Python, Pandas und SQL an echten Kundendaten und erstellst Dashboards. Ideal für Studenten der (Wirtschafts-)Informatik oder Statistik.',
   'Berlin', 'Praktikum', '1.400 €/Monat', 'aktiv'),
  (1, 'Werkstudent IT-Support',
   'Du bist erste Anlaufstelle für technische Fragen der Kollegen, richtest Arbeitsplätze ein und pflegst unser Ticketsystem. Flexible Arbeitszeiten, ideal neben dem Studium.',
   'Remote', 'Werkstudent', '15 €/h', 'aktiv'),
  (2, 'Werkstudent Marketing & Kommunikation',
   'Unterstütze unser Marketing-Team bei der Content-Erstellung, Pflege der Website und Vorbereitung von Kampagnen. Du hast ein gutes Sprachgefühl und Interesse an Nachhaltigkeitsthemen.',
   'München', 'Werkstudent', '14–16 €/h', 'aktiv'),
  (2, 'Minijob: Eventhelfer Nachhaltigkeitsmesse',
   'Für unsere jährliche Nachhaltigkeitsmesse suchen wir Helfer für Auf- und Abbau, Standbetreuung und Gästeempfang. Wochenend-Einsatz, ideal für einen unkomplizierten Nebenverdienst.',
   'München', 'Minijob', '538 €/Monat', 'aktiv'),
  (2, 'Teilzeit: Junior-Buchhaltung',
   'Du übernimmst vorbereitende Buchhaltung, prüfst Belege und unterstützt beim Monatsabschluss. Kaufmännische Grundkenntnisse erforderlich, 20 Std./Woche.',
   'München', 'Teilzeit', '2.000 €/Monat', 'pausiert'),
  (3, 'Praktikum Online-Redaktion',
   'Du recherchierst und schreibst Artikel für unser Studi-Magazin, führst Interviews und lernst das Handwerk des Online-Journalismus. Sehr gute Deutschkenntnisse und Freude am Schreiben vorausgesetzt.',
   'Hamburg', 'Praktikum', '1.200 €/Monat', 'aktiv'),
  (3, 'Werkstudent Social Media',
   'Du betreust unsere Instagram- und TikTok-Kanäle, planst Redaktionspläne und erstellst kurze Videos. Kreativität und ein Gespür für Trends sind wichtiger als Vorerfahrung.',
   'Hamburg', 'Werkstudent', '15 €/h', 'aktiv');

-- --- Weitere Stellenanzeigen (Dummy-Daten für eine lebendigere Übersicht) ---
-- created_at wird bewusst gestreut, damit die Liste realistische Datumsangaben
-- ("heute", "vor 3 Tagen", …) und gemischte "Neu"-Markierungen zeigt.
INSERT INTO jobs (company_id, title, description, location, job_type, salary_range, status, created_at) VALUES
  (1, 'Werkstudent Frontend (React)',
   'Du entwickelst gemeinsam mit unserem Team moderne Web-Oberflächen mit React. Du setzt Designs in sauberen, wiederverwendbaren Komponenten um und achtest auf gute Performance. Erste Erfahrung mit JavaScript und HTML/CSS ist von Vorteil.',
   'Berlin', 'Werkstudent', '17–21 €/h', 'aktiv', DATE_SUB(NOW(), INTERVAL 1 DAY)),
  (4, 'Praktikum Game Development (Unity)',
   'Sechsmonatiges Praktikum in der Spieleentwicklung. Du arbeitest mit Unity und C# an echten Projekten, von Prototyp bis Release, und lernst den gesamten Entwicklungsprozess kennen.',
   'Köln', 'Praktikum', '1.300 €/Monat', 'aktiv', DATE_SUB(NOW(), INTERVAL 2 DAY)),
  (4, 'Werkstudent QA & Testing',
   'Du testest unsere Spiele und Web-Apps, dokumentierst Fehler und hilfst, die Qualität hochzuhalten. Sorgfalt und ein gutes Auge fürs Detail sind wichtiger als Vorerfahrung.',
   'Remote', 'Werkstudent', '15 €/h', 'aktiv', DATE_SUB(NOW(), INTERVAL 4 DAY)),
  (5, 'Werkstudent Supply-Chain-Analytics',
   'Du wertest Logistikdaten aus, baust Dashboards und hilfst, Lieferketten effizienter zu machen. Kenntnisse in SQL oder Excel sind hilfreich, Neugier auf Daten ist Pflicht.',
   'Hamburg', 'Werkstudent', '16 €/h', 'aktiv', DATE_SUB(NOW(), INTERVAL 3 DAY)),
  (5, 'Minijob Lagerlogistik (Wochenende)',
   'Du unterstützt am Wochenende bei Wareneingang, Kommissionierung und Versand. Körperlich aktiv, gut planbar, ideal als Nebenjob neben dem Studium.',
   'Hamburg', 'Minijob', '538 €/Monat', 'aktiv', DATE_SUB(NOW(), INTERVAL 6 DAY)),
  (6, 'Praktikum UX/UI Design',
   'Du gestaltest mit uns intuitive Oberflächen für Patienten und Praxen. Von Wireframes über Prototypen (Figma) bis zu Nutzertests bist du Teil des gesamten Designprozesses.',
   'München', 'Praktikum', '1.350 €/Monat', 'aktiv', NOW()),
  (6, 'Werkstudent Mobile App (Flutter)',
   'Du arbeitest an unserer Gesundheits-App mit Flutter mit, setzt neue Features um und verbesserst bestehende. Interesse an mobiler Entwicklung vorausgesetzt.',
   'Remote', 'Werkstudent', '18 €/h', 'aktiv', DATE_SUB(NOW(), INTERVAL 5 DAY)),
  (2, 'Werkstudent Datenanalyse Nachhaltigkeit',
   'Du berechnest Ökobilanzen, bereitest Daten auf und unterstützt unsere Berater mit aussagekräftigen Auswertungen. Sorgfalt und Interesse an Nachhaltigkeit sind gefragt.',
   'München', 'Werkstudent', '16–18 €/h', 'aktiv', DATE_SUB(NOW(), INTERVAL 8 DAY)),
  (3, 'Minijob Grafikdesign',
   'Du gestaltest Social-Media-Grafiken, Story-Templates und kleine Illustrationen für unser Magazin. Sicherer Umgang mit einem Grafikprogramm (z. B. Canva oder Photoshop) erwünscht.',
   'Hamburg', 'Minijob', '538 €/Monat', 'aktiv', DATE_SUB(NOW(), INTERVAL 10 DAY)),
  (1, 'Teilzeit DevOps-Unterstützung',
   'Du hilfst beim Betrieb unserer Cloud-Infrastruktur, automatisierst Deployments und überwachst Systeme. Erste Erfahrung mit Linux, Docker oder CI/CD ist ein Plus. 20 Std./Woche.',
   'Berlin', 'Teilzeit', '2.200 €/Monat', 'pausiert', DATE_SUB(NOW(), INTERVAL 12 DAY)),
  (6, 'Vollzeit Junior Backend Developer',
   'Du steigst nach dem Studium bei uns ein und entwickelst skalierbare Backend-Services (Node.js). Wir bieten Mentoring, moderne Tools und viel Verantwortung von Anfang an.',
   'München', 'Vollzeit', '45.000 €/Jahr', 'aktiv', DATE_SUB(NOW(), INTERVAL 14 DAY)),
  (4, 'Werkstudent Community Management',
   'Du betreust unsere Spieler-Community auf Discord und in Foren, sammelst Feedback und organisierst kleine Online-Events. Diese Stelle ist aktuell bereits besetzt.',
   'Remote', 'Werkstudent', '14 €/h', 'geschlossen', DATE_SUB(NOW(), INTERVAL 20 DAY));

-- --- Bewerbungen (5) ---
INSERT INTO applications (job_id, student_name, student_email, cover_letter, status) VALUES
  (1, 'Lena Hofmann', 'lena.hofmann@uni-berlin.de',
   'Sehr geehrtes Team von TechNova, als Informatikstudentin im 4. Semester suche ich eine Werkstudententätigkeit im Backend-Bereich. Ich habe bereits zwei kleinere REST-APIs mit Node.js umgesetzt und würde mich freuen, mein Wissen bei Ihnen zu vertiefen.',
   'offen'),
  (1, 'Jonas Becker', 'j.becker@student.tu-berlin.de',
   'Hallo, ich studiere Wirtschaftsinformatik und programmiere seit drei Jahren in JavaScript. Die ausgeschriebene Stelle passt perfekt zu meinen Interessen. Über eine Rückmeldung freue ich mich sehr.',
   'gesehen'),
  (2, 'Aylin Yıldız', 'aylin.yildiz@fu-berlin.de',
   'Guten Tag, ich studiere Statistik im Master und habe umfangreiche Erfahrung mit Python und Pandas. Ein Praktikum bei Ihnen wäre der ideale nächste Schritt für mich.',
   'angenommen'),
  (4, 'Maximilian Schuster', 'max.schuster@lmu.de',
   'Liebes GreenLeaf-Team, Nachhaltigkeit ist mir ein persönliches Anliegen. Als BWL-Student mit Schwerpunkt Marketing möchte ich gerne Teil Ihres Teams werden.',
   'offen'),
  (7, 'Sophie Wagner', 'sophie.wagner@uni-hamburg.de',
   'Hallo, ich schreibe leidenschaftlich gerne und bin im Journalismus-Studium. Ihre Online-Redaktion klingt nach genau der Praxiserfahrung, die ich suche.',
   'abgelehnt');

-- --- Job-Alert (Demo) für die Studentin Lena (id 1): Werkstudent-Stellen ---
INSERT INTO job_alerts (student_id, title, location, job_type) VALUES
  (1, '', '', 'Werkstudent');

-- =====================================================================
-- Fertig. Kurze Kontrollausgabe der Datensatz-Anzahlen.
-- =====================================================================
SELECT
  (SELECT COUNT(*) FROM companies)    AS unternehmen,
  (SELECT COUNT(*) FROM students)     AS studierende,
  (SELECT COUNT(*) FROM jobs)         AS jobs,
  (SELECT COUNT(*) FROM applications) AS bewerbungen,
  (SELECT COUNT(*) FROM job_alerts)   AS job_alerts;

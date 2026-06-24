'use strict';

/* ==========================================================================
   StudyWork – Studenten-Profil (profile.html).
   Zwei Modi anhand der URL:
   - ohne ?id   : eigenes Profil bearbeiten (nur für eingeloggte Studenten)
   - mit  ?id=N : Profil ansehen (read-only); der Server prüft den Zugriff
                  (eigenes Profil | Unternehmen mit Bewerbung | Sichtbarkeit=all)
   Mit ?id=<eigene>&preview=1 sieht man die eigene Außenansicht.
   ========================================================================== */

(function () {
  const {
    API, escapeHtml: esc, showToast, isEmail, formatDate,
    setFieldError, clearFieldErrors, userReady, ICON, setUser, setFlash,
  } = window.StudyWork;

  const root = document.getElementById('profile-root');

  const VISIBILITY_LABEL = {
    applied: 'Nur Unternehmen, bei denen ich mich beworben habe',
    all: 'Alle Unternehmen',
  };

  // Badge colour per application status (mirrors the dashboard).
  const APP_STATUS_CLASS = { offen: 'info', gesehen: 'warning', angenommen: 'success', abgelehnt: 'danger' };

  // Splits the comma-separated skills string into trimmed, non-empty entries.
  function parseSkills(str) {
    return String(str || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  function skillBadges(str) {
    const skills = parseSkills(str);
    if (!skills.length) return '';
    return `<div class="skill-list">${skills.map((s) => `<span class="badge badge-neutral">${esc(s)}</span>`).join('')}</div>`;
  }

  /* --- Nachricht / Fehlerzustände ---------------------------------------- */

  function renderMessage(title, text, links) {
    root.innerHTML = `
      <div class="empty-state" style="margin-top:32px;">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        <h1>${esc(title)}</h1>
        <p>${esc(text)}</p>
        ${links ? `<div class="hero-actions" style="justify-content:center;margin-top:18px;">${links}</div>` : ''}
      </div>`;
  }

  /* --- Ansichtsmodus (read-only) ----------------------------------------- */

  function renderView(p, { isPreview, viewer } = {}) {
    document.title = `${p.name} – Profil – StudyWork`;
    const metaParts = [p.study_program, p.university, p.location].filter(Boolean).map(esc);
    const meta = metaParts.length
      ? `<div class="meta" style="margin-top:8px;">${metaParts.map((m) => `<span>${m}</span>`).join('')}</div>`
      : '';

    let website = (p.website || '').trim();
    if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
    const websiteRow = website
      ? `<p class="mb-0" style="margin-top:14px;"><strong>Website:</strong> <a href="${esc(website)}" target="_blank" rel="noopener">${esc(website.replace(/^https?:\/\//i, ''))}</a></p>`
      : '';

    const bio = p.bio
      ? `<h2>Über mich</h2><div class="prose">${esc(p.bio)}</div>`
      : '';
    const skills = parseSkills(p.skills).length
      ? `<h2>Skills</h2>${skillBadges(p.skills)}`
      : '';
    const cv = p.cv_filename
      ? `<h2>Lebenslauf</h2>
         <div class="cv-row">
           <div class="cv-info">
             <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
             <strong>${esc(p.cv_filename)}</strong>
           </div>
           <a class="btn btn-secondary btn-sm" href="${API.students.cvUrl(p.id)}" target="_blank" rel="noopener">Lebenslauf ansehen</a>
         </div>`
      : '';

    // Companies return to their dashboard, everyone else to the job search.
    const backHref = viewer && viewer.role === 'company' ? 'company-dashboard.html' : 'jobs.html';
    const backLabel = viewer && viewer.role === 'company' ? 'Zurück zum Dashboard' : 'Zurück zur Jobsuche';
    const previewBanner = isPreview
      ? `<div class="preview-banner">${ICON.info}<span>Vorschau – so sehen Unternehmen dein Profil.</span>
           <a class="btn btn-secondary btn-sm" href="profile.html">Zurück zum Bearbeiten</a></div>`
      : `<a class="back-link" href="${backHref}">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
           ${backLabel}</a>`;

    root.innerHTML = `
      ${previewBanner}
      <div class="card card-pad profile-card">
        <div class="profile-head">
          <span class="profile-avatar" aria-hidden="true">${ICON.user}</span>
          <div style="min-width:0;">
            <h1 class="mb-0">${esc(p.name)}</h1>
            ${p.headline ? `<p class="profile-headline">${esc(p.headline)}</p>` : ''}
            ${meta}
          </div>
        </div>
        ${bio || skills || cv ? '<hr class="divider" />' : ''}
        ${bio}
        ${skills}
        ${cv}
        ${websiteRow}
        ${p.email ? `<p class="text-muted" style="margin-top:16px;font-size:0.9rem;">Kontakt: <a href="mailto:${esc(p.email)}">${esc(p.email)}</a></p>` : ''}
      </div>`;
  }

  /* --- Bearbeitungsmodus (eigenes Profil) -------------------------------- */

  function renderEdit(p) {
    document.title = 'Mein Profil – StudyWork';
    const opt = (v) => `<option value="${v}"${p.profile_visibility === v ? ' selected' : ''}>${esc(VISIBILITY_LABEL[v])}</option>`;
    root.innerHTML = `
      <div class="page-head">
        <h1>Mein Profil</h1>
        <p>Diese Angaben können Unternehmen sehen, wenn du dich bewirbst. Alles ist optional.</p>
      </div>
      <div class="card card-pad">
        <form id="profile-form" novalidate>
          <div class="profile-account">
            ${ICON.user}
            <div><strong>${esc(p.name)}</strong><span class="text-muted">${esc(p.email)}</span></div>
          </div>
          <div class="form-group">
            <label for="p-headline">Kurzprofil / Headline</label>
            <input class="input" type="text" id="p-headline" name="headline" maxlength="150" placeholder="z. B. Informatikstudentin · sucht Werkstudentenstelle" value="${esc(p.headline || '')}" />
            <span class="field-error" id="err-headline"></span>
          </div>
          <div class="form-group">
            <label for="p-bio">Über mich</label>
            <textarea class="textarea" id="p-bio" name="bio" maxlength="2000" placeholder="Erzähle kurz, wer du bist, was dich interessiert und was du suchst.">${esc(p.bio || '')}</textarea>
            <div class="form-hint char-count"><span id="bio-count">0</span>/2000 Zeichen</div>
          </div>
          <div class="form-group">
            <label for="p-skills">Skills</label>
            <input class="input" type="text" id="p-skills" name="skills" maxlength="500" placeholder="z. B. JavaScript, SQL, Teamarbeit" value="${esc(p.skills || '')}" />
            <div class="form-hint">Mehrere Skills durch Komma trennen.</div>
          </div>
          <div class="form-grid-2">
            <div class="form-group">
              <label for="p-study">Studiengang</label>
              <input class="input" type="text" id="p-study" name="study_program" maxlength="150" placeholder="z. B. Informatik (B.Sc.)" value="${esc(p.study_program || '')}" />
            </div>
            <div class="form-group">
              <label for="p-university">Hochschule</label>
              <input class="input" type="text" id="p-university" name="university" maxlength="150" placeholder="z. B. TU Berlin" value="${esc(p.university || '')}" />
            </div>
          </div>
          <div class="form-grid-2">
            <div class="form-group">
              <label for="p-location">Ort</label>
              <input class="input" type="text" id="p-location" name="location" maxlength="100" placeholder="z. B. Berlin" value="${esc(p.location || '')}" />
            </div>
            <div class="form-group">
              <label for="p-website">Website / Portfolio</label>
              <input class="input" type="text" id="p-website" name="website" maxlength="255" placeholder="https://…" value="${esc(p.website || '')}" />
            </div>
          </div>
          <div class="form-group">
            <label for="p-visibility">Wer darf mein Profil sehen?</label>
            <select class="select" id="p-visibility" name="profile_visibility">
              ${opt('applied')}
              ${opt('all')}
            </select>
            <div class="form-hint">Bei „nur beworbene" sehen nur Unternehmen dein Profil, bei denen du dich beworben hast.</div>
          </div>
          <div class="profile-actions">
            <button class="btn btn-primary" type="submit" id="profile-submit">Profil speichern</button>
            <a class="btn btn-ghost" href="profile.html?id=${p.id}&preview=1">Vorschau ansehen</a>
          </div>
        </form>
      </div>

      <section style="margin-top:28px;">
        <h2>Lebenslauf</h2>
        <div id="cv-section"></div>
        <input type="file" id="cv-file" accept="application/pdf,.pdf" hidden />
        <p class="form-hint" style="margin-top:8px;">Nur PDF, max. 3&nbsp;MB. Unternehmen sehen den Lebenslauf über dein Profil, wenn du dich bewirbst.</p>
      </section>

      <section style="margin-top:28px;">
        <h2>Meine Bewerbungen</h2>
        <div id="my-applications" aria-live="polite">
          <div class="skeleton skel-card" style="height:90px"></div>
        </div>
      </section>

      <section style="margin-top:28px;">
        <h2>Meine Job-Alerts</h2>
        <p class="text-muted" style="font-size:0.9rem;margin-top:-6px;">Wir benachrichtigen dich unter <strong>${esc(p.email)}</strong>, sobald neue passende Stellen erscheinen. Neue Alerts legst du über „Job-Alert" auf der <a href="jobs.html">Jobsuche</a> an.</p>
        <div id="my-alerts" aria-live="polite">
          <div class="skeleton skel-card" style="height:70px"></div>
        </div>
      </section>

      <section class="danger-zone" style="margin-top:28px;">
        <h2>Konto löschen</h2>
        <p class="text-muted mb-0">Dein Profil und alle deine Bewerbungen werden dauerhaft entfernt. Das kann nicht rückgängig gemacht werden.</p>
        <button class="btn btn-danger" type="button" id="delete-account" style="margin-top:14px;">Konto endgültig löschen</button>
      </section>`;

    const form = document.getElementById('profile-form');
    const counter = document.getElementById('bio-count');
    counter.textContent = form.bio.value.length;
    form.bio.addEventListener('input', () => { counter.textContent = form.bio.value.length; });
    form.addEventListener('submit', onSubmit);
    document.getElementById('delete-account').addEventListener('click', onDeleteAccount);

    // CV file input is shared by the "upload" and "replace" buttons.
    document.getElementById('cv-file').addEventListener('change', onCvFile);
    renderCvSection(p);

    renderMyApplications();
    renderMyAlerts();
  }

  const CV_MAX_BYTES = 3 * 1024 * 1024;
  const FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>';

  // Renders the CV block (uploaded state vs empty) and wires its buttons.
  function renderCvSection(profile) {
    const box = document.getElementById('cv-section');
    if (!box) return;
    if (profile.cv_filename) {
      box.innerHTML = `
        <div class="card card-pad cv-row">
          <div class="cv-info">
            ${FILE_ICON}
            <div style="min-width:0;">
              <strong>${esc(profile.cv_filename)}</strong>
              <span class="text-muted">hochgeladen am ${formatDate(profile.cv_uploaded_at)}</span>
            </div>
          </div>
          <div class="app-actions">
            <a class="btn btn-secondary btn-sm" href="${API.students.cvUrl(profile.id)}" target="_blank" rel="noopener">Ansehen</a>
            <button class="btn btn-ghost btn-sm" type="button" id="cv-replace">Ersetzen</button>
            <button class="icon-btn" type="button" id="cv-remove" aria-label="Lebenslauf entfernen" title="Lebenslauf entfernen">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </div>`;
      document.getElementById('cv-replace').addEventListener('click', () => document.getElementById('cv-file').click());
      document.getElementById('cv-remove').addEventListener('click', onCvRemove);
    } else {
      box.innerHTML = `
        <div class="card card-pad">
          <p class="text-muted mb-0">Noch kein Lebenslauf hochgeladen.</p>
          <button class="btn btn-primary btn-sm" type="button" id="cv-upload-btn" style="margin-top:12px;">PDF hochladen</button>
        </div>`;
      document.getElementById('cv-upload-btn').addEventListener('click', () => document.getElementById('cv-file').click());
    }
  }

  // Validates the chosen file, reads it as base64 and uploads it.
  function onCvFile(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) {
      showToast('Bitte eine PDF-Datei auswählen.', 'error');
      return;
    }
    if (file.size > CV_MAX_BYTES) {
      showToast('Die Datei ist zu groß (max. 3 MB).', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      // result is a data URL: "data:application/pdf;base64,XXXX" – send only XXXX.
      const base64 = String(reader.result).split(',')[1] || '';
      try {
        const updated = await API.students.uploadCv({ filename: file.name, data: base64 });
        showToast('Lebenslauf hochgeladen.', 'success');
        renderCvSection(updated);
      } catch (err) {
        showToast(err.message, 'error');
      }
    };
    reader.onerror = () => showToast('Die Datei konnte nicht gelesen werden.', 'error');
    reader.readAsDataURL(file);
  }

  async function onCvRemove() {
    if (!window.confirm('Lebenslauf wirklich entfernen?')) return;
    try {
      const updated = await API.students.deleteCv();
      showToast('Lebenslauf entfernt.', 'success');
      renderCvSection(updated);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // Loads and renders the student's saved job alerts (with live match counts).
  async function renderMyAlerts() {
    const box = document.getElementById('my-alerts');
    if (!box) return;
    try {
      const alerts = await API.students.alerts();
      if (!alerts.length) {
        box.innerHTML = '<p class="text-muted mb-0">Noch keine Job-Alerts gespeichert.</p>';
        return;
      }
      box.innerHTML = alerts.map(alertRowHtml).join('');
      box.querySelectorAll('[data-alert-delete]').forEach((btn) => {
        btn.addEventListener('click', () => removeAlert(Number(btn.dataset.alertDelete)));
      });
    } catch (err) {
      box.innerHTML = `<p class="text-muted mb-0">Job-Alerts konnten nicht geladen werden: ${esc(err.message)}</p>`;
    }
  }

  // Human-readable summary + a shareable jobs.html link for an alert's criteria.
  function alertRowHtml(alert) {
    const parts = [];
    if (alert.title) parts.push(`„${esc(alert.title)}"`);
    if (alert.location) parts.push(esc(alert.location));
    if (alert.job_type) parts.push(esc(alert.job_type));
    const summary = parts.length ? parts.join(' · ') : 'Alle neuen Jobs';

    const sp = new URLSearchParams();
    if (alert.title) sp.set('title', alert.title);
    if (alert.location) sp.set('location', alert.location);
    if (alert.job_type) sp.set('job_type', alert.job_type);
    const href = sp.toString() ? `jobs.html?${sp.toString()}` : 'jobs.html';

    // List the jobs this alert currently suggests (newest first, max 5).
    const matches = alert.matches || [];
    let matchesHtml;
    if (!matches.length) {
      matchesHtml = '<p class="text-muted alert-empty">Aktuell keine passenden Stellen. Sobald eine erscheint, würden wir dich benachrichtigen.</p>';
    } else {
      const items = matches.map((j) => `
        <li>
          <a href="job-detail.html?id=${j.id}">${esc(j.title)}</a>
          <span class="text-muted">${esc(j.company_name)}${j.location ? ' · ' + esc(j.location) : ''}</span>
        </li>`).join('');
      const more = alert.match_count > matches.length
        ? `<a class="alert-more" href="${href}">Alle ${alert.match_count} ansehen →</a>`
        : '';
      matchesHtml = `<ul class="alert-matches">${items}</ul>${more}`;
    }

    return `
      <div class="card card-pad alert-card">
        <div class="alert-head">
          <div class="my-app-main">
            <span class="my-app-title">${summary}</span>
            <span class="text-muted">${alert.match_count} passende ${alert.match_count === 1 ? 'Stelle' : 'Stellen'} aktuell</span>
          </div>
          <div class="app-actions">
            <a class="btn btn-secondary btn-sm" href="${href}">Suche öffnen</a>
            <button class="icon-btn" type="button" data-alert-delete="${alert.id}" aria-label="Job-Alert löschen" title="Job-Alert löschen">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
            </button>
          </div>
        </div>
        ${matchesHtml}
      </div>`;
  }

  async function removeAlert(id) {
    try {
      await API.students.removeAlert(id);
      showToast('Job-Alert gelöscht.', 'success');
      renderMyAlerts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  // Permanently deletes the student's own account (with confirmation).
  async function onDeleteAccount() {
    const ok = window.confirm(
      'Konto wirklich löschen?\nDein Profil und alle deine Bewerbungen werden dauerhaft entfernt. Dies kann nicht rückgängig gemacht werden.'
    );
    if (!ok) return;
    const btn = document.getElementById('delete-account');
    btn.disabled = true;
    btn.textContent = 'Wird gelöscht…';
    try {
      await API.students.deleteMe();
      setUser(null);
      setFlash('Dein Konto wurde gelöscht.', 'success');
      window.location.href = 'index.html';
    } catch (err) {
      showToast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Konto endgültig löschen';
    }
  }

  // Loads and renders the logged-in student's own applications + their status.
  async function renderMyApplications() {
    const box = document.getElementById('my-applications');
    if (!box) return;
    try {
      const apps = await API.students.myApplications();
      if (!apps.length) {
        box.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <h3>Noch keine Bewerbungen</h3>
            <p>Stöbere durch die Jobs und bewirb dich in wenigen Minuten.</p>
            <a class="btn btn-primary" href="jobs.html" style="margin-top:16px;">Jobs entdecken</a>
          </div>`;
        return;
      }
      box.innerHTML = apps.map(applicationRowHtml).join('');
    } catch (err) {
      box.innerHTML = `<p class="text-muted">Bewerbungen konnten nicht geladen werden: ${esc(err.message)}</p>`;
    }
  }

  function applicationRowHtml(app) {
    const cls = APP_STATUS_CLASS[app.status] || 'neutral';
    return `
      <div class="card card-pad my-app">
        <div class="my-app-main">
          <a class="my-app-title" href="job-detail.html?id=${app.job_id}">${esc(app.job_title)}</a>
          <span class="text-muted">${esc(app.company_name)} · beworben am ${formatDate(app.created_at)}</span>
        </div>
        <span class="badge badge-${cls}">${esc(app.status)}</span>
      </div>`;
  }

  async function onSubmit(event) {
    event.preventDefault();
    const form = event.target;
    clearFieldErrors(form);

    const data = {
      headline: form.headline.value.trim(),
      bio: form.bio.value.trim(),
      skills: form.skills.value.trim(),
      study_program: form.study_program.value.trim(),
      university: form.university.value.trim(),
      location: form.location.value.trim(),
      website: form.website.value.trim(),
      profile_visibility: form.profile_visibility.value,
    };

    const submitBtn = document.getElementById('profile-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Speichern…';
    try {
      await API.students.updateMe(data);
      showToast('Profil gespeichert.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Profil speichern';
    }
  }

  /* --- Router ------------------------------------------------------------- */

  function loadingHtml() {
    return `
      <div class="skeleton skel-line" style="width:30%"></div>
      <div class="skeleton skel-card" style="height:280px;margin-top:16px"></div>`;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    root.innerHTML = loadingHtml();
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id');
    const isPreview = params.has('preview');
    const user = await userReady;

    // View mode: an id is given (and it isn't our own non-preview profile).
    const idNum = Number(idParam);
    const viewingOwn = user && user.role === 'student' && idNum === user.id;

    if (idParam && (!viewingOwn || isPreview)) {
      try {
        const profile = await API.students.get(idNum);
        renderView(profile, { isPreview: isPreview && viewingOwn, viewer: user });
      } catch (err) {
        renderMessage('Profil nicht verfügbar', err.message,
          '<a class="btn btn-secondary" href="jobs.html">Zur Jobsuche</a>');
      }
      return;
    }

    // Edit mode: own profile – requires a student login.
    if (!user) {
      renderMessage('Anmeldung erforderlich', 'Bitte melde dich als Student an, um dein Profil zu bearbeiten.',
        '<a class="btn btn-primary" href="login.html">Anmelden</a><a class="btn btn-secondary" href="register.html">Registrieren</a>');
      return;
    }
    if (user.role !== 'student') {
      renderMessage('Nur für Studenten', 'Der Profilbereich steht nur Studenten zur Verfügung.',
        '<a class="btn btn-secondary" href="company-dashboard.html">Zum Dashboard</a>');
      return;
    }
    try {
      const profile = await API.students.me();
      renderEdit(profile);
    } catch (err) {
      renderMessage('Profil konnte nicht geladen werden', err.message,
        '<a class="btn btn-secondary" href="index.html">Zur Startseite</a>');
    }
  });
})();

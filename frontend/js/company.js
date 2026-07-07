'use strict';

(function () {
  const {
    API, escapeHtml: esc, showToast, ICON,
    isEmail, formatDate, setFieldError, clearFieldErrors,
    getUser, setUser, userReady, setFlash,
  } = window.StudyWork;

  //ENUMs.
  const JOB_TYPES = ['Werkstudent', 'Praktikum', 'Teilzeit', 'Vollzeit', 'Minijob'];
  const JOB_STATUSES = ['aktiv', 'pausiert', 'geschlossen'];
  const APP_STATUSES = ['offen', 'gesehen', 'angenommen', 'abgelehnt'];
  const JOB_STATUS_CLASS = { aktiv: 'success', pausiert: 'warning', geschlossen: 'danger' };
  const APP_STATUS_CLASS = { offen: 'info', gesehen: 'warning', angenommen: 'success', abgelehnt: 'danger' };

  
  let activeCompany = null; 
  let activeCompanyId = null;
  let currentJobs = [];
  let currentApps = {}; // jobId -> [applications]
  let appFilter = 'alle';

  // DOM Referenzen
  let barEl;
  let contentEl;

  function badge(text, cls) {
    return `<span class="badge badge-${cls}">${esc(text)}</span>`;
  }

  /* --- Modal-Steuerung --------------------------------------------------- */

  
  let lastFocused = null;

  function openModal(id) {
    lastFocused = document.activeElement;
    const modal = document.getElementById(id);
    modal.hidden = false;
    const first = modal.querySelector('input:not([type="hidden"]), textarea, select');
    if (first) setTimeout(() => first.focus(), 30);
  }

  function hideBackdrop(backdrop) {
    backdrop.hidden = true;
    if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
    lastFocused = null;
  }

  function closeModal(id) {
    hideBackdrop(document.getElementById(id));
  }

  function setupModalDismiss() {
    document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) hideBackdrop(backdrop);
      });
      backdrop.querySelectorAll('[data-close]').forEach((btn) => {
        btn.addEventListener('click', () => hideBackdrop(backdrop));
      });
      backdrop.addEventListener('keydown', (event) => {
        if (event.key !== 'Tab') return;
        const focusables = backdrop.querySelectorAll(
          'a[href], button:not([disabled]), input:not([type="hidden"]), select, textarea'
        );
        if (!focusables.length) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      });
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        document.querySelectorAll('.modal-backdrop:not([hidden])').forEach(hideBackdrop);
      }
    });
  }

  /* --- Eingeloggtes Unternehmen laden ------------------------------------- */

  async function loadCompany() {
    activeCompany = await API.companies.get(activeCompanyId);
    renderCompanyBar();
  }

  function renderCompanyBar() {
    barEl.hidden = !activeCompany;
    if (activeCompany) {
      document.getElementById('company-bar-name').textContent = activeCompany.name;
    }
  }

  /* --- Dashboard rendern ------------------------------------------------- */

  function dashboardSkeleton() {
    return `
      <div class="grid grid-stats" style="margin-bottom:22px;">
        <div class="skeleton skel-card" style="height:92px"></div>
        <div class="skeleton skel-card" style="height:92px"></div>
        <div class="skeleton skel-card" style="height:92px"></div>
      </div>
      <div class="skeleton skel-card" style="height:120px;margin-bottom:16px"></div>
      <div class="skeleton skel-card" style="height:120px"></div>`;
  }

  function loginRequiredHtml() {
  const user = getUser();

  const hint = 'Melde dich mit deinem Unternehmenskonto an, um Stellenanzeigen zu veröffentlichen und Bewerbungen zu verwalten.';

  if (user && user.role === 'student') {
    return `
      <div class="empty-state">
        <h3>Zugriff nicht möglich</h3>
        <p>Du bist als Student (${esc(user.name)}) angemeldet. Das Dashboard steht nur Unternehmen zur Verfügung.</p>
      </div>`;
  }

  return `
    <div class="empty-state">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      <h3>Anmeldung erforderlich</h3>
      <p>${hint}</p>
      <div class="toolbar" style="justify-content:center;margin-top:18px;">
        <a class="btn btn-primary" href="login.html">Anmelden</a>
        <a class="btn btn-secondary" href="register.html">Unternehmen registrieren</a>
      </div>
    </div>`;
}

  function jobBlockHtml(job, apps) {
    const meta = [];
    if (job.location) meta.push(esc(job.location));
    if (job.salary_range) meta.push(esc(job.salary_range));
    const metaLine = meta.length
      ? `<div class="text-muted" style="font-size:0.88rem;margin-top:6px;">${meta.join(' · ')}</div>`
      : '';

    const appsInner = apps.length
      ? apps.map(appItemHtml).join('')
      : '<p class="text-muted mb-0">Noch keine Bewerbungen für diese Stelle.</p>';

    // Quick status switcher (aktiv/pausiert/geschlossen)
    const statusOptions = JOB_STATUSES
      .map((s) => `<option value="${s}"${s === job.status ? ' selected' : ''}>${s}</option>`)
      .join('');

    const appStatuses = [...new Set(apps.map((a) => a.status))].join(' ');

    return `
      <div class="card card-pad job-block" style="margin-bottom:16px;" data-app-statuses="${appStatuses}">
        <div class="row-between">
          <div style="min-width:0;">
            <div class="tag-row" style="margin-bottom:8px;">
              ${badge(job.job_type, 'type')}
              <span class="badge badge-${JOB_STATUS_CLASS[job.status] || 'neutral'} js-job-status">${esc(job.status)}</span>
            </div>
            <h3 class="mb-0">${esc(job.title)}</h3>
            ${metaLine}
          </div>
          <div class="app-actions">
            <select class="select select-inline" data-job-status data-id="${job.id}" aria-label="Status der Anzeige „${esc(job.title)}“ ändern">
              ${statusOptions}
            </select>
            <button class="btn btn-secondary btn-sm" data-action="edit-job" data-id="${job.id}">Bearbeiten</button>
            <button class="btn btn-danger btn-sm" data-action="delete-job" data-id="${job.id}">Löschen</button>
          </div>
        </div>
        <hr class="divider" />
        <button class="btn btn-ghost btn-sm" data-action="toggle-apps" data-id="${job.id}" aria-expanded="false" aria-controls="apps-${job.id}">
          Bewerbungen anzeigen (${apps.length})
        </button>
        <div id="apps-${job.id}" hidden style="margin-top:14px;">
          ${appsInner}
        </div>
      </div>`;
  }

  function appItemHtml(app) {
    const cover = app.cover_letter
      ? `<p class="text-muted" style="font-size:0.88rem;margin:8px 0 0;">${esc(app.cover_letter)}</p>`
      : '';
    const options = APP_STATUSES
      .map((s) => `<option value="${s}"${s === app.status ? ' selected' : ''}>${s}</option>`)
      .join('');
    const profileLink = app.student_id
      ? `<a class="profile-link" href="profile.html?id=${app.student_id}">${ICON.user}Profil ansehen</a>`
      : '';
    return `
      <div class="app-item" data-app-status="${app.status}">
        <div class="app-main">
          <strong>${esc(app.student_name)}</strong>
          <span class="email">
            <a href="mailto:${esc(app.student_email)}">${esc(app.student_email)}</a>
            <button class="copy-email" type="button" data-action="copy-email" data-email="${esc(app.student_email)}" aria-label="E-Mail-Adresse kopieren" title="E-Mail kopieren">${ICON.copy}</button>
            · beworben am ${formatDate(app.created_at)}
          </span>
          ${profileLink}
          ${cover}
        </div>
        <div class="app-actions">
          ${badge(app.status, APP_STATUS_CLASS[app.status] || 'neutral')}
          <select class="select" data-app-id="${app.id}" style="width:auto;padding:7px 32px 7px 11px;font-size:0.85rem;" aria-label="Status der Bewerbung von ${esc(app.student_name)} ändern">
            ${options}
          </select>
          <button class="icon-btn" type="button" data-action="delete-app" data-id="${app.id}" aria-label="Bewerbung von ${esc(app.student_name)} löschen" title="Bewerbung löschen">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
          </button>
        </div>
      </div>`;
  }

  function dashboardHtml(jobs, appsByJob) {
    const totalApps = jobs.reduce((sum, j) => sum + (appsByJob[j.id] || []).length, 0);
    const openApps = jobs.reduce(
      (sum, j) => sum + (appsByJob[j.id] || []).filter((a) => a.status === 'offen').length,
      0
    );

    const stats = `
      <div class="grid grid-stats" style="margin-bottom:24px;">
        <div class="stat-card"><div class="num">${jobs.length}</div><div class="label">Stellenanzeigen</div></div>
        <div class="stat-card"><div class="num">${totalApps}</div><div class="label">Bewerbungen</div></div>
        <div class="stat-card"><div class="num">${openApps}</div><div class="label">davon offen</div></div>
      </div>`;

    const head = `
      <div class="row-between" style="margin-bottom:18px;">
        <h2 class="mb-0">Deine Stellenanzeigen</h2>
        <button class="btn btn-primary" data-action="new-job">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Neuer Job
        </button>
      </div>`;

    const allApps = jobs.flatMap((j) => appsByJob[j.id] || []);
    let filterBar = '';
    if (allApps.length) {
      const counts = APP_STATUSES.reduce((acc, s) => {
        acc[s] = allApps.filter((a) => a.status === s).length;
        return acc;
      }, {});
      const chip = (value, label, count) =>
        `<button class="filter-chip" type="button" data-app-filter="${value}" aria-pressed="${appFilter === value}">${label} <span class="chip-count">${count}</span></button>`;
      const statusChips = APP_STATUSES.map((s) => chip(s, s, counts[s])).join('');
      filterBar = `
        <div class="app-filter-bar" role="group" aria-label="Bewerbungen nach Status filtern">
          <span class="app-filter-label">Bewerbungen:</span>
          ${chip('alle', 'alle', allApps.length)}
          ${statusChips}
        </div>`;
    }

    const list = jobs.length
      ? jobs.map((j) => jobBlockHtml(j, appsByJob[j.id] || [])).join('')
      : `<div class="empty-state">
           <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>
           <h3>Noch keine Stellenanzeigen</h3>
           <p>Erstelle deine erste Anzeige, um Bewerbungen zu erhalten.</p>
           <button class="btn btn-primary" data-action="new-job" style="margin-top:16px;">Erste Anzeige erstellen</button>
         </div>`;

    return stats + head + filterBar + list;
  }

  async function renderDashboard() {
    if (!activeCompanyId) {
      contentEl.innerHTML = loginRequiredHtml();
      return;
    }
    const openPanels = [...contentEl.querySelectorAll('[id^="apps-"]:not([hidden])')].map((el) => el.id);
    contentEl.innerHTML = dashboardSkeleton();
    try {
      const jobs = await API.jobs.list({ company_id: activeCompanyId });
      const appsByJob = {};
      await Promise.all(
        jobs.map(async (job) => { appsByJob[job.id] = await API.applications.list({ job_id: job.id }); })
      );
      currentJobs = jobs;
      currentApps = appsByJob;
      contentEl.innerHTML = dashboardHtml(jobs, appsByJob);
      if (appFilter !== 'alle') {
        applyAppFilter(appFilter);
      } else {
        openPanels.forEach((panelId) => setPanelOpen(panelId, true));
      }
    } catch (err) {
      contentEl.innerHTML = `<div class="empty-state"><h3>Daten konnten nicht geladen werden</h3><p>${esc(err.message)}</p></div>`;
      showToast(err.message, 'error');
    }
  }

  function setPanelOpen(panelId, open) {
    const panel = document.getElementById(panelId);
    const btn = contentEl.querySelector(`[aria-controls="${panelId}"]`);
    if (!panel || !btn) return;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
    const count = (currentApps[Number(panelId.replace('apps-', ''))] || []).length;
    btn.textContent = open ? `Bewerbungen ausblenden (${count})` : `Bewerbungen anzeigen (${count})`;
  }

  function refreshAppFilterState() {
    currentJobs.forEach((job) => {
      const block = contentEl.querySelector(`#apps-${job.id}`)?.closest('.job-block');
      if (block) {
        block.dataset.appStatuses = [...new Set((currentApps[job.id] || []).map((a) => a.status))].join(' ');
      }
    });
    const allApps = Object.values(currentApps).flat();
    contentEl.querySelectorAll('.filter-chip').forEach((chip) => {
      const v = chip.dataset.appFilter;
      const count = v === 'alle' ? allApps.length : allApps.filter((a) => a.status === v).length;
      const c = chip.querySelector('.chip-count');
      if (c) c.textContent = count;
    });
    if (appFilter !== 'alle') applyAppFilter(appFilter);
  }

  function applyAppFilter(status) {
    appFilter = status;
    contentEl.querySelectorAll('.filter-chip').forEach((chip) => {
      chip.setAttribute('aria-pressed', String(chip.dataset.appFilter === status));
    });
    if (status === 'alle') {
      delete contentEl.dataset.appFilter;
    } else {
      contentEl.dataset.appFilter = status;
      contentEl.querySelectorAll('[id^="apps-"]').forEach((panel) => setPanelOpen(panel.id, true));
    }
  }

  /* --- Aktionen: Job-Modal ---------------------------------------------- */

  function openJobModal(job) {
    const form = document.getElementById('job-form');
    clearFieldErrors(form);
    form.reset();
    document.getElementById('job-modal-title').textContent = job ? 'Job bearbeiten' : 'Neuen Job erstellen';
    document.getElementById('job-id').value = job ? job.id : '';
    if (job) {
      form.title.value = job.title || '';
      form.description.value = job.description || '';
      form.job_type.value = job.job_type || '';
      form.status.value = job.status || 'aktiv';
      form.location.value = job.location || '';
      form.salary_range.value = job.salary_range || '';
    } else {
      form.status.value = 'aktiv';
    }
    openModal('job-modal');
  }

  async function onJobSubmit(event) {
    event.preventDefault();
    const form = event.target;
    clearFieldErrors(form);

    const id = document.getElementById('job-id').value;
    const data = {
      company_id: activeCompanyId,
      title: form.title.value.trim(),
      description: form.description.value.trim(),
      job_type: form.job_type.value,
      status: form.status.value,
      location: form.location.value.trim(),
      salary_range: form.salary_range.value.trim(),
    };

    let invalid = false;
    if (!data.title) { setFieldError(form, 'title', 'Bitte gib einen Titel an.'); invalid = true; }
    if (!data.description) { setFieldError(form, 'description', 'Bitte gib eine Beschreibung an.'); invalid = true; }
    if (!JOB_TYPES.includes(data.job_type)) { setFieldError(form, 'job_type', 'Bitte wähle eine Anstellungsart.'); invalid = true; }
    if (invalid) return;

    const submitBtn = document.getElementById('job-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Speichern…';
    try {
      if (id) await API.jobs.update(Number(id), data);
      else await API.jobs.create(data);
      showToast(id ? 'Stellenanzeige aktualisiert.' : 'Stellenanzeige erstellt.', 'success');
      closeModal('job-modal');
      renderDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Speichern';
    }
  }

  async function deleteJob(id) {
    const job = currentJobs.find((j) => j.id === id);
    const ok = await confirmDelete(
      `Stellenanzeige „${job ? job.title : ''}“ wirklich löschen? Alle zugehörigen Bewerbungen werden ebenfalls entfernt.`
    );
    if (!ok) return;
    try {
      await API.jobs.remove(id);
      showToast('Stellenanzeige gelöscht.', 'success');
      renderDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function deleteApplication(id) {
    const app = Object.values(currentApps).flat().find((a) => a.id === id);
    const ok = await confirmDelete(
     `Bewerbung von „${app ? app.student_name : ''}“ wirklich löschen? Dies kann nicht rückgängig gemacht werden.`
    );
    if (!ok) return;
    try {
      await API.applications.remove(id);
      showToast('Bewerbung gelöscht.', 'success');
      renderDashboard();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function toggleApps(btn, id) {
    const container = document.getElementById(`apps-${id}`);
    if (!container) return;
    const willShow = container.hidden;
    container.hidden = !willShow;
    btn.setAttribute('aria-expanded', String(willShow));
    const count = (currentApps[id] || []).length;
    btn.textContent = willShow ? `Bewerbungen ausblenden (${count})` : `Bewerbungen anzeigen (${count})`;
  }

  async function updateJobStatus(jobId, status, selectEl_) {
    selectEl_.disabled = true;
    try {
      await API.jobs.patch(jobId, { status });
      const card = selectEl_.closest('.card');
      const badgeEl = card ? card.querySelector('.js-job-status') : null;
      if (badgeEl) {
        badgeEl.className = `badge badge-${JOB_STATUS_CLASS[status] || 'neutral'} js-job-status`;
        badgeEl.textContent = status;
      }
      const cached = currentJobs.find((j) => j.id === jobId);
      if (cached) cached.status = status;
      showToast('Status der Stellenanzeige aktualisiert.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
      renderDashboard();
    } finally {
      selectEl_.disabled = false;
    }
  }

  async function updateApplicationStatus(appId, status, selectEl_) {
    selectEl_.disabled = true;
    try {
      await API.applications.patch(appId, { status });
      const item = selectEl_.closest('.app-item');
      const badgeEl = item.querySelector('.badge');
      if (badgeEl) {
        badgeEl.className = `badge badge-${APP_STATUS_CLASS[status] || 'neutral'}`;
        badgeEl.textContent = status;
      }
      if (item) item.dataset.appStatus = status;
      Object.values(currentApps).forEach((arr) => {
        const found = arr.find((a) => a.id === appId);
        if (found) found.status = status;
      });
      refreshAppFilterState();
      showToast('Bewerbungsstatus aktualisiert.', 'success');
    } catch (err) {
      showToast(err.message, 'error');
      renderDashboard();
    } finally {
      selectEl_.disabled = false;
    }
  }

  /* --- Aktionen: Profil-Modal (Unternehmen bearbeiten) ------------------- */

  function openCompanyModal(company) {
    const form = document.getElementById('company-form');
    clearFieldErrors(form);
    form.reset();
    document.getElementById('company-id').value = company.id;
    form.name.value = company.name || '';
    form.email.value = company.email || '';
    form.description.value = company.description || '';
    form.website.value = company.website || '';
    openModal('company-modal');
  }

  async function onCompanySubmit(event) {
    event.preventDefault();
    const form = event.target;
    clearFieldErrors(form);

    const id = Number(document.getElementById('company-id').value);
    const data = {
      name: form.name.value.trim(),
      email: form.email.value.trim(),
      description: form.description.value.trim(),
      website: form.website.value.trim(),
    };

    if (data.website && !/^https?:\/\//i.test(data.website)) {
      data.website = `https://${data.website}`;
    }

    let invalid = false;
    if (!data.name) { setFieldError(form, 'name', 'Bitte gib den Unternehmensnamen an.'); invalid = true; }
    if (!data.email) { setFieldError(form, 'email', 'Bitte gib eine E-Mail-Adresse an.'); invalid = true; }
    else if (!isEmail(data.email)) { setFieldError(form, 'email', 'Diese E-Mail-Adresse ist ungültig.'); invalid = true; }
    if (invalid) return;

    const submitBtn = document.getElementById('company-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Speichern…';
    try {
      const saved = await API.companies.update(id, data);
      showToast('Profil aktualisiert.', 'success');
      closeModal('company-modal');
      activeCompany = saved;
      renderCompanyBar();
      setUser({ ...getUser(), name: saved.name, email: saved.email });
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Speichern';
    }
  }

  async function deleteCompany() {
    if (!activeCompany) return;
    const ok = await confirmDelete(
      `Unternehmen „${activeCompany.name}“ wirklich löschen? Alle Stellenanzeigen und Bewerbungen dieses Unternehmens werden ebenfalls gelöscht.`
    );
    if (!ok) return;
    try {
      await API.companies.remove(activeCompany.id);
      setUser(null);
      setFlash('Unternehmen gelöscht.', 'success');
      window.location.href = 'index.html';
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  /* --- Event-Delegation für den dynamischen Inhalt ----------------------- */

  function onContentClick(event) {
    const filterChip = event.target.closest('.filter-chip');
    if (filterChip) {
      applyAppFilter(filterChip.dataset.appFilter);
      return;
    }

    const actionEl = event.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    const id = Number(actionEl.dataset.id);
    if (action === 'new-job') openJobModal();
    else if (action === 'edit-job') openJobModal(currentJobs.find((j) => j.id === id));
    else if (action === 'delete-job') deleteJob(id);
    else if (action === 'delete-app') deleteApplication(id);
    else if (action === 'toggle-apps') toggleApps(actionEl, id);
    else if (action === 'copy-email') copyEmail(actionEl.dataset.email, actionEl);
  }

  function legacyCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  async function copyEmail(email, btn) {
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(email);
        ok = true;
      }
    } catch (err) { ok = false; }
    if (!ok) ok = legacyCopy(email);

    if (ok) {
      btn.classList.add('copied');
      setTimeout(() => btn.classList.remove('copied'), 1200);
      showToast('E-Mail-Adresse kopiert.', 'success');
    } else {
      showToast('Kopieren nicht möglich. Bitte manuell markieren.', 'error');
    }
  }

  function onContentChange(event) {
    const jobSel = event.target.closest('select[data-job-status]');
    if (jobSel) {
      updateJobStatus(Number(jobSel.dataset.id), jobSel.value, jobSel);
      return;
    }
    const sel = event.target.closest('select[data-app-id]');
    if (sel) updateApplicationStatus(Number(sel.dataset.appId), sel.value, sel);
  }

  /* --- Initialisierung --------------------------------------------------- */

  async function init() {
    barEl = document.getElementById('company-bar');
    contentEl = document.getElementById('dashboard-content');

    setupModalDismiss();

    document.getElementById('edit-company-btn').addEventListener('click', () => {
      if (activeCompany) openCompanyModal(activeCompany);
    });
    document.getElementById('delete-company-btn').addEventListener('click', deleteCompany);

    document.getElementById('job-form').addEventListener('submit', onJobSubmit);
    document.getElementById('company-form').addEventListener('submit', onCompanySubmit);
    contentEl.addEventListener('click', onContentClick);
    contentEl.addEventListener('change', onContentChange);

    const user = await userReady;
    if (!user || user.role !== 'company') {
      contentEl.innerHTML = loginRequiredHtml();
      return;
    }

    activeCompanyId = user.id;
    try {
      await loadCompany();
      renderDashboard();
    } catch (err) {
      contentEl.innerHTML = `<div class="empty-state"><h3>Verbindungsfehler</h3><p>${esc(err.message)}</p></div>`;
      showToast(err.message, 'error');
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  function confirmDelete(message) {
    return new Promise((resolve) => {
      const modal = document.getElementById('delete-modal');
      const text = document.getElementById('delete-modal-text');
      const confirmBtn = document.getElementById('delete-confirm-btn');

      text.textContent = message;
      modal.hidden = false;

      function cleanup(result) {
        modal.hidden = true;
        confirmBtn.removeEventListener('click', onConfirm);
        modal.querySelectorAll('[data-close]').forEach((btn) => {
          btn.removeEventListener('click', onCancel);
        });
        resolve(result);
      }

      function onConfirm() {
        cleanup(true);
      }

      function onCancel() {
        cleanup(false);
      }

      confirmBtn.addEventListener('click', onConfirm);
      modal.querySelectorAll('[data-close]').forEach((btn) => {
        btn.addEventListener('click', onCancel);
      });
    });
  }
})();

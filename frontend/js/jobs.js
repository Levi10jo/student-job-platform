'use strict';

/* ==========================================================================
   StudyWork – Studenten-Sicht.
   Bedient zwei Seiten (anhand <body data-page>):
   - "jobs"       : Jobsuche mit Live-Filtern, Sortierung & URL-Sync (jobs.html)
   - "job-detail" : Jobdetail + Bewerbungsformular + Unternehmensprofil
                    (job-detail.html)
   ========================================================================== */

(function () {
  const {
    API, escapeHtml: esc, showToast,
    isEmail, formatDate, debounce, setFieldError, clearFieldErrors,
    META_ICON, typeBadge, statusBadge, renderJobCard,
    getFavorites, favButton, userReady, isNew,
  } = window.StudyWork;

  // localStorage key for the optional "remember my data" applicant prefill.
  const APPLICANT_KEY = 'sw-applicant';
  const SORT_MODES = ['neu', 'alt', 'titel'];

  /* ======================================================================
     Seite 1: Jobsuche
     ====================================================================== */
  function initJobList() {
    const form = document.getElementById('filter-form');
    const grid = document.getElementById('jobs-grid');
    const countEl = document.getElementById('result-count');
    const resetBtn = document.getElementById('reset-filters');
    const sortSelect = document.getElementById('sort-select');
    const favToggle = document.getElementById('fav-filter');
    const remoteToggle = document.getElementById('remote-filter');
    const alertBtn = document.getElementById('job-alert-btn');

    // Last fetched result set – sorting happens client-side on this copy.
    let lastJobs = [];
    // When active, only jobs on the local favourites list are shown.
    let favOnly = false;
    // When active, only postings located "Remote" are shown.
    let remoteOnly = false;

    function showSkeletons(n = 6) {
      grid.innerHTML = Array.from({ length: n })
        .map(() => `
          <div class="job-card" aria-hidden="true">
            <div class="skeleton skel-line" style="width:40%"></div>
            <div class="skeleton skel-line" style="width:75%;height:18px"></div>
            <div class="skeleton skel-line" style="width:55%"></div>
            <div class="skeleton skel-line" style="width:90%"></div>
            <div class="skeleton skel-line" style="width:35%;margin-top:8px"></div>
          </div>`)
        .join('');
    }

    function sortJobs(jobs, mode) {
      const copy = jobs.slice();
      // The API delivers newest first, so "alt" is simply the reverse order.
      if (mode === 'alt') copy.reverse();
      else if (mode === 'titel') copy.sort((a, b) => a.title.localeCompare(b.title, 'de'));
      return copy;
    }

    function renderJobs() {
      let jobs = sortJobs(lastJobs, sortSelect.value);
      if (remoteOnly) {
        jobs = jobs.filter((j) => /remote/i.test(j.location || ''));
      }
      if (favOnly) {
        const favs = getFavorites();
        jobs = jobs.filter((j) => favs.includes(j.id));
      }
      if (!jobs.length) {
        countEl.textContent = '';
        let headline = 'Keine passenden Jobs gefunden';
        let hint = 'Versuche es mit anderen Suchbegriffen oder setze die Filter zurück.';
        if (favOnly) {
          headline = 'Noch keine gemerkten Jobs';
          hint = 'Tippe auf das Herz einer Stellenanzeige, um sie hier zu sammeln.';
        } else if (remoteOnly) {
          headline = 'Keine Remote-Stellen gefunden';
          hint = 'Aktuell sind keine Remote-Jobs ausgeschrieben. Schalte den Remote-Filter aus, um alle zu sehen.';
        }
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <h3>${headline}</h3>
            <p>${hint}</p>
          </div>`;
        return;
      }
      countEl.textContent = `${jobs.length} ${jobs.length === 1 ? 'Job' : 'Jobs'} gefunden`;
      grid.innerHTML = jobs.map(renderJobCard).join('');
    }

    // Keeps the favourites filter button label/count in sync.
    function updateFavToggle() {
      const count = getFavorites().length;
      document.getElementById('fav-count').textContent = count;
      favToggle.setAttribute('aria-pressed', String(favOnly));
    }

    async function loadJobs(filters) {
      showSkeletons();
      try {
        // Students only see postings that are open for applications.
        lastJobs = await API.jobs.list({ ...filters, status: 'aktiv' });
        renderJobs();
      } catch (err) {
        grid.innerHTML = `
          <div class="empty-state" style="grid-column:1/-1;">
            <h3>Jobs konnten nicht geladen werden</h3>
            <p>${esc(err.message)}</p>
          </div>`;
        showToast(err.message, 'error');
      }
    }

    function currentFilters() {
      const data = new FormData(form);
      return {
        title: (data.get('title') || '').trim(),
        location: (data.get('location') || '').trim(),
        job_type: data.get('job_type') || '',
      };
    }

    function hasActiveFilters(f) {
      return Boolean(f.title || f.location || f.job_type);
    }

    // Keeps the address bar in sync so a filtered search can be shared,
    // bookmarked or restored after a reload.
    function syncUrl(filters) {
      const sp = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) sp.set(key, value);
      });
      if (sortSelect.value !== 'neu') sp.set('sort', sortSelect.value);
      if (remoteOnly) sp.set('remote', '1');
      const query = sp.toString();
      history.replaceState(null, '', query ? `?${query}` : window.location.pathname);
    }

    function refresh() {
      const filters = currentFilters();
      resetBtn.hidden = !hasActiveFilters(filters);
      syncUrl(filters);
      loadJobs(filters);
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      refresh();
    });

    // Live search: text inputs filter while typing (debounced),
    // dropdown changes apply immediately.
    const liveRefresh = debounce(refresh, 300);
    form.elements.title.addEventListener('input', liveRefresh);
    form.elements.location.addEventListener('input', liveRefresh);
    form.elements.job_type.addEventListener('change', refresh);

    // Sorting is purely client-side – no need to refetch.
    sortSelect.addEventListener('change', () => {
      syncUrl(currentFilters());
      renderJobs();
    });

    resetBtn.addEventListener('click', () => {
      form.reset();
      sortSelect.value = 'neu';
      refresh();
    });

    // Favourites filter: purely client-side on the already fetched list.
    favToggle.addEventListener('click', () => {
      favOnly = !favOnly;
      updateFavToggle();
      renderJobs();
    });
    // Re-render when a heart is toggled so the active filter stays accurate.
    document.addEventListener('sw:favorites', () => {
      updateFavToggle();
      if (favOnly) renderJobs();
    });
    updateFavToggle();

    // Remote filter: purely client-side on the already fetched list.
    remoteToggle.addEventListener('click', () => {
      remoteOnly = !remoteOnly;
      remoteToggle.setAttribute('aria-pressed', String(remoteOnly));
      syncUrl(currentFilters());
      renderJobs();
    });

    // Job-Alert: only logged-in students may save a search. Show the button
    // once the session is known; clicking saves the current filters as an alert.
    userReady.then((user) => {
      if (user && user.role === 'student') alertBtn.hidden = false;
    });
    alertBtn.addEventListener('click', async () => {
      const user = await userReady;
      if (!user || user.role !== 'student') {
        showToast('Bitte melde dich als Student an, um Job-Alerts zu nutzen.', 'info');
        return;
      }
      const filters = currentFilters();
      alertBtn.disabled = true;
      try {
        const alert = await API.students.createAlert(filters);
        showToast(`Job-Alert gespeichert (${alert.match_count} passende Jobs). Wir benachrichtigen dich unter ${user.email}.`, 'success');
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        alertBtn.disabled = false;
      }
    });

    // Keyboard shortcut: pressing "/" jumps to the search field (unless the
    // user is already typing somewhere). A power-user nicety, common on
    // search-heavy sites.
    const searchInput = form.elements.title;
    searchInput.placeholder = 'Stichwort, z. B. Marketing  ( / )';
    document.addEventListener('keydown', (event) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      event.preventDefault();
      searchInput.focus();
      searchInput.select();
    });

    // Restore filters + sort order from the URL (e.g. shared links).
    const params = new URLSearchParams(window.location.search);
    ['title', 'location', 'job_type'].forEach((key) => {
      if (params.has(key) && form.elements[key]) form.elements[key].value = params.get(key);
    });
    if (SORT_MODES.includes(params.get('sort'))) sortSelect.value = params.get('sort');
    if (params.get('remote') === '1') {
      remoteOnly = true;
      remoteToggle.setAttribute('aria-pressed', 'true');
    }
    refresh();
  }

  /* ======================================================================
     Seite 2: Jobdetail + Bewerbung
     ====================================================================== */
  function initJobDetail() {
    const root = document.getElementById('job-detail');
    const id = new URLSearchParams(window.location.search).get('id');

    if (!id || !/^\d+$/.test(id)) {
      window.location.replace('404.html');
      return;
    }

    // If the visitor came from a filtered search, keep those filters in the
    // back link instead of dropping them on the plain jobs page.
    const backLink = document.querySelector('.back-link');
    if (backLink && document.referrer) {
      try {
        const ref = new URL(document.referrer);
        if (ref.origin === window.location.origin && ref.pathname.endsWith('/jobs.html') && ref.search) {
          backLink.href = `jobs.html${ref.search}`;
        }
      } catch (err) { /* invalid referrer – keep the default link */ }
    }

    root.innerHTML = `
      <div class="detail-grid">
        <div>
          <div class="skeleton skel-line" style="width:30%"></div>
          <div class="skeleton skel-line" style="width:70%;height:26px;margin-top:12px"></div>
          <div class="skeleton skel-line" style="width:40%"></div>
          <div class="skeleton skel-card" style="height:220px;margin-top:20px"></div>
        </div>
        <div class="skeleton skel-card" style="height:320px"></div>
      </div>`;

    loadJob(id);

    async function loadJob(jobId) {
      try {
        const job = await API.jobs.get(jobId);
        renderDetail(job);
        loadCompanyExtras(job);
        markAppliedState(job);
      } catch (err) {
        // A missing job (404) should land on the friendly 404 page.
        window.location.replace('404.html');
      }
    }

    // Badge colour + label per application status.
    const APP_STATUS_CLASS = { offen: 'info', gesehen: 'warning', angenommen: 'success', abgelehnt: 'danger' };

    // If a logged-in student already applied to this job, replace the form
    // with a clear notice + current status (the server blocks duplicates anyway).
    async function markAppliedState(job) {
      const user = await userReady;
      if (!user || user.role !== 'student') return;
      let apps;
      try {
        apps = await API.students.myApplications();
      } catch (err) {
        return; // not critical – leave the form as is
      }
      const mine = apps.find((a) => a.job_id === job.id);
      if (!mine) return;
      const aside = document.querySelector('#job-detail aside');
      if (!aside) return;
      aside.classList.remove('sticky');
      const cls = APP_STATUS_CLASS[mine.status] || 'neutral';
      aside.innerHTML = `
        <div style="text-align:center;">
          <div class="feat-icon" style="margin:0 auto 14px;background:var(--color-success-soft);color:var(--color-success);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <h2 style="margin-bottom:6px;">Bereits beworben</h2>
          <p class="text-muted">Du hast dich auf diese Stelle beworben.</p>
          <p style="margin:10px 0 18px;">Status: <span class="badge badge-${cls}">${esc(mine.status)}</span></p>
          <a class="btn btn-secondary btn-block" href="profile.html">Meine Bewerbungen ansehen</a>
        </div>`;
    }

    function applyFormHtml(job) {
      if (job.status !== 'aktiv') {
        const message = job.status === 'geschlossen'
          ? 'Diese Stelle ist geschlossen und nimmt keine Bewerbungen mehr entgegen.'
          : 'Diese Stelle ist derzeit pausiert und nimmt vorübergehend keine Bewerbungen entgegen.';
        return `
          <aside class="card card-pad">
            <h2>Bewerbung</h2>
            <p class="text-muted mb-0">${message}</p>
            <a class="btn btn-secondary btn-block" href="jobs.html" style="margin-top:16px;">Andere Jobs ansehen</a>
          </aside>`;
      }
      return `
        <aside class="card card-pad sticky">
          <h2>Jetzt bewerben</h2>
          <p class="text-muted" style="font-size:0.9rem;margin-bottom:18px;">Deine Daten gehen direkt an das Unternehmen.</p>
          <form id="apply-form" novalidate>
            <div class="form-group">
              <label for="student_name">Name <span class="required" aria-hidden="true">*</span></label>
              <input class="input" type="text" id="student_name" name="student_name" autocomplete="name" maxlength="100" required />
              <span class="field-error" id="err-student_name"></span>
            </div>
            <div class="form-group">
              <label for="student_email">E-Mail <span class="required" aria-hidden="true">*</span></label>
              <input class="input" type="email" id="student_email" name="student_email" autocomplete="email" maxlength="100" required />
              <span class="field-error" id="err-student_email"></span>
            </div>
            <div class="form-group">
              <label for="cover_letter">Anschreiben</label>
              <textarea class="textarea" id="cover_letter" name="cover_letter" maxlength="2000" placeholder="Erzähle kurz, warum du gut passt (optional)."></textarea>
              <div class="form-hint char-count"><span id="cover-count">0</span>/2000 Zeichen</div>
            </div>
            <label class="check-row" for="remember-me">
              <input type="checkbox" id="remember-me" checked />
              <span>Name &amp; E-Mail auf diesem Gerät merken</span>
            </label>
            <button class="btn btn-primary btn-block" type="submit">Bewerbung absenden</button>
          </form>
        </aside>`;
    }

    function renderDetail(job) {
      const meta = [];
      if (job.location) meta.push(`<span>${META_ICON.location}${esc(job.location)}</span>`);
      if (job.salary_range) meta.push(`<span>${META_ICON.salary}${esc(job.salary_range)}</span>`);
      meta.push(`<span>${META_ICON.date}Veröffentlicht am ${formatDate(job.created_at)}</span>`);

      document.title = `${job.title} – StudyWork`;
      const statusTag = job.status === 'aktiv' ? '' : statusBadge(job.status);

      root.innerHTML = `
        <div class="detail-grid">
          <div>
            <div class="tag-row" style="margin-bottom:14px;">${typeBadge(job.job_type)}${isNew(job.created_at) ? '<span class="badge badge-new">Neu</span>' : ''}${statusTag}${favButton(job)}</div>
            <h1 style="margin-bottom:6px;">${esc(job.title)}</h1>
            <p class="company" style="font-weight:600;color:var(--color-text-muted);">${esc(job.company_name)}</p>
            <div class="meta" style="margin-top:6px;">${meta.join('')}</div>
            <hr class="divider" />
            <h2>Stellenbeschreibung</h2>
            <div class="prose">${esc(job.description)}</div>
            <div id="company-box"></div>
            <div id="similar-jobs"></div>
            ${reportBlockHtml()}
          </div>
          ${applyFormHtml(job)}
        </div>`;

      initApplyForm(job);
      setupReport(job);
    }

    // "Job melden" – a discreet toggle that reveals a compact report form.
    function reportBlockHtml() {
      const reasons = [
        ['fake', 'Fake-Inserat'],
        ['spam', 'Spam / Werbung'],
        ['abgelaufen', 'Stelle ist abgelaufen'],
        ['unangemessen', 'Unangemessener Inhalt'],
        ['sonstiges', 'Sonstiges'],
      ];
      const options = reasons.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
      return `
        <hr class="divider" />
        <div class="report-block">
          <button class="report-toggle" type="button" id="report-toggle" aria-expanded="false" aria-controls="report-panel">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
            Job melden
          </button>
          <div id="report-panel" hidden>
            <p class="text-muted" style="font-size:0.88rem;margin:10px 0 12px;">Stimmt mit dieser Anzeige etwas nicht? Sag uns, was los ist.</p>
            <form id="report-form" novalidate>
              <div class="form-group">
                <label for="report-reason">Grund</label>
                <select class="select" id="report-reason" name="reason">${options}</select>
              </div>
              <div class="form-group">
                <label for="report-message">Nachricht (optional)</label>
                <textarea class="textarea" id="report-message" name="message" maxlength="500" placeholder="Weitere Details (optional)."></textarea>
              </div>
              <div class="report-actions">
                <button class="btn btn-ghost btn-sm" type="button" id="report-cancel">Abbrechen</button>
                <button class="btn btn-danger btn-sm" type="submit" id="report-submit">Meldung senden</button>
              </div>
            </form>
          </div>
        </div>`;
    }

    function setupReport(job) {
      const toggle = document.getElementById('report-toggle');
      const panel = document.getElementById('report-panel');
      const form = document.getElementById('report-form');
      if (!toggle || !panel || !form) return;

      toggle.addEventListener('click', () => {
        const show = panel.hidden;
        panel.hidden = !show;
        toggle.setAttribute('aria-expanded', String(show));
      });
      document.getElementById('report-cancel').addEventListener('click', () => {
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const btn = document.getElementById('report-submit');
        btn.disabled = true;
        btn.textContent = 'Wird gesendet…';
        try {
          await API.jobs.report(job.id, {
            reason: form.reason.value,
            message: form.message.value.trim() || undefined,
          });
          showToast('Danke! Deine Meldung ist eingegangen und wird geprüft.', 'success');
          // Collapse and lock the block after a successful report.
          panel.hidden = true;
          toggle.disabled = true;
          toggle.setAttribute('aria-expanded', 'false');
          toggle.innerHTML = toggle.innerHTML.replace('Job melden', 'Gemeldet');
        } catch (err) {
          showToast(err.message, 'error');
          btn.disabled = false;
          btn.textContent = 'Meldung senden';
        }
      });
    }

    // Loads company profile + other openings of the same company. These are
    // optional extras – if they fail, the page stays fully usable.
    async function loadCompanyExtras(job) {
      try {
        const [company, companyJobs] = await Promise.all([
          API.companies.get(job.company_id),
          API.jobs.list({ company_id: job.company_id, status: 'aktiv' }),
        ]);
        renderCompanyBox(company);
        renderSimilarJobs(job, companyJobs);
      } catch (err) {
        /* extras only – ignore */
      }
    }

    function renderCompanyBox(company) {
      const box = document.getElementById('company-box');
      if (!box) return;
      // Normalise the website so the link works even without a protocol.
      let website = (company.website || '').trim();
      if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
      const parts = [];
      if (company.description) parts.push(`<p class="text-muted">${esc(company.description)}</p>`);
      if (website) {
        parts.push(`<p class="mb-0"><strong>Website:</strong> <a href="${esc(website)}" target="_blank" rel="noopener">${esc(website.replace(/^https?:\/\//i, ''))}</a></p>`);
      }
      if (!parts.length) return;
      box.innerHTML = `
        <hr class="divider" />
        <h2>Über ${esc(company.name)}</h2>
        ${parts.join('')}`;
    }

    function renderSimilarJobs(job, companyJobs) {
      const el = document.getElementById('similar-jobs');
      if (!el) return;
      const others = companyJobs.filter((j) => j.id !== job.id).slice(0, 3);
      if (!others.length) return;
      el.innerHTML = `
        <hr class="divider" />
        <h2>Weitere Jobs von ${esc(job.company_name)}</h2>
        <div class="grid grid-jobs">${others.map(renderJobCard).join('')}</div>`;
    }

    function readSavedApplicant() {
      try {
        return JSON.parse(localStorage.getItem(APPLICANT_KEY) || 'null');
      } catch (err) {
        return null;
      }
    }

    function initApplyForm(job) {
      const form = document.getElementById('apply-form');
      if (!form) return;

      // Prefill name/email if the visitor opted in on a previous application.
      const saved = readSavedApplicant();
      if (saved) {
        form.student_name.value = saved.name || '';
        form.student_email.value = saved.email || '';
      }

      // Logged-in students get their account data prefilled (account data
      // wins over the locally remembered values). The "remember me" checkbox
      // is pointless in that case, so it is hidden and disarmed.
      userReady.then((user) => {
        if (user && user.role === 'student') {
          form.student_name.value = user.name;
          form.student_email.value = user.email;
          const rememberRow = form.querySelector('.check-row');
          if (rememberRow) {
            rememberRow.hidden = true;
            document.getElementById('remember-me').checked = false;
          }
          // Make the profile/CV connection explicit in the application flow.
          const hint = document.createElement('p');
          hint.className = 'form-hint';
          hint.style.margin = '0 0 14px';
          hint.innerHTML = 'Dein <a href="profile.html">Profil</a> (inkl. Lebenslauf) wird dem Unternehmen mit deiner Bewerbung verknüpft.';
          form.insertBefore(hint, form.firstElementChild);
        }
      });

      // Live character counter for the cover letter.
      const counter = document.getElementById('cover-count');
      form.cover_letter.addEventListener('input', () => {
        counter.textContent = form.cover_letter.value.length;
      });

      // Clear a field's error as soon as the user edits it.
      form.addEventListener('input', (event) => {
        const group = event.target.closest('.form-group');
        if (group) group.classList.remove('has-error');
      });

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearFieldErrors(form);

        const name = form.student_name.value.trim();
        const email = form.student_email.value.trim();
        const cover = form.cover_letter.value.trim();
        const remember = document.getElementById('remember-me').checked;

        let invalid = false;
        if (!name) { setFieldError(form, 'student_name', 'Bitte gib deinen Namen an.'); invalid = true; }
        if (!email) {
          setFieldError(form, 'student_email', 'Bitte gib deine E-Mail-Adresse an.'); invalid = true;
        } else if (!isEmail(email)) {
          setFieldError(form, 'student_email', 'Diese E-Mail-Adresse ist ungültig.'); invalid = true;
        }
        if (invalid) return;

        const submitBtn = form.querySelector('button[type="submit"]');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Wird gesendet…';

        try {
          await API.applications.create({
            job_id: job.id,
            student_name: name,
            student_email: email,
            cover_letter: cover || undefined,
          });
          try {
            if (remember) localStorage.setItem(APPLICANT_KEY, JSON.stringify({ name, email }));
            else localStorage.removeItem(APPLICANT_KEY);
          } catch (err) { /* storage unavailable – not critical */ }
          showToast('Deine Bewerbung wurde erfolgreich gesendet!', 'success');
          showConfirmation(job);
        } catch (err) {
          showToast(err.message, 'error');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Bewerbung absenden';
        }
      });
    }

    // Replaces the form with a success confirmation after applying.
    function showConfirmation(job) {
      const aside = document.querySelector('#job-detail aside');
      if (!aside) return;
      aside.classList.remove('sticky');
      aside.innerHTML = `
        <div style="text-align:center;">
          <div class="feat-icon" style="margin:0 auto 14px;background:var(--color-success-soft);color:var(--color-success);">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
          </div>
          <h2 style="margin-bottom:6px;">Bewerbung gesendet!</h2>
          <p class="text-muted">Vielen Dank. Das Unternehmen hat deine Bewerbung für „${esc(job.title)}“ erhalten.</p>
          <a class="btn btn-secondary btn-block" href="jobs.html" style="margin-top:8px;">Weitere Jobs ansehen</a>
        </div>`;
    }
  }

  /* --- Router ------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', () => {
    const page = document.body.dataset.page;
    if (page === 'jobs') initJobList();
    else if (page === 'job-detail') initJobDetail();
  });
})();

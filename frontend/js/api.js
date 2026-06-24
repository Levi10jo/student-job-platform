'use strict';

/* ==========================================================================
   StudyWork – Frontend-Basis-Layer (von jeder Seite geladen).
   Enthält:
   - API: zentraler REST-Client (fetch-Wrapper)
   - UI-Helfer: escapeHtml (XSS-Schutz), showToast
   - Theme-Umschaltung (Light/Dark)
   - mountChrome(): rendert Navigation + Footer (DRY, keine HTML-Duplikate)
   Alles wird unter window.StudyWork bereitgestellt.
   ========================================================================== */

window.StudyWork = (function () {
  const API_BASE = '/api/v1';

  /* --- SVG-Icons (inline, stroke-basiert) -------------------------------- */
  const ICON = {
    briefcase: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/></svg>',
    sun: '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>',
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.1V12a10 10 0 1 1-5.9-9.1"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21.2l7.8-7.8 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
    logout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
    arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  };

  // Small inline icons for job meta rows (location / salary / publish date).
  const META_ICON = {
    location: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
    salary: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 7a6 6 0 1 0 0 10"/><line x1="4" y1="11" x2="14" y2="11"/><line x1="4" y1="14" x2="13" y2="14"/></svg>',
    date: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  };

  /* --- API-Client -------------------------------------------------------- */

  // Builds a query string from an object, skipping empty/undefined values.
  function qs(params) {
    if (!params) return '';
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') {
        sp.append(key, value);
      }
    });
    const s = sp.toString();
    return s ? `?${s}` : '';
  }

  // Core request helper. Resolves with response.data on success, throws an
  // Error carrying the server's German message on any failure.
  async function request(method, path, body) {
    const options = { method, headers: {} };
    if (body !== undefined) {
      options.headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(body);
    }

    let response;
    try {
      response = await fetch(API_BASE + path, options);
    } catch (err) {
      throw new Error('Netzwerkfehler – der Server ist nicht erreichbar.');
    }

    let json = null;
    try {
      json = await response.json();
    } catch (err) {
      json = null;
    }

    if (!response.ok || !json || json.success === false) {
      const message = (json && json.error) || `Unerwarteter Fehler (HTTP ${response.status}).`;
      throw new Error(message);
    }
    return json.data;
  }

  // Resource-specific convenience methods mapped onto the REST endpoints.
  const API = {
    jobs: {
      list: (params) => request('GET', `/jobs${qs(params)}`),
      get: (id) => request('GET', `/jobs/${id}`),
      create: (data) => request('POST', '/jobs', data),
      update: (id, data) => request('PUT', `/jobs/${id}`, data),
      patch: (id, data) => request('PATCH', `/jobs/${id}`, data),
      remove: (id) => request('DELETE', `/jobs/${id}`),
      report: (id, data) => request('POST', `/jobs/${id}/report`, data),
    },
    applications: {
      list: (params) => request('GET', `/applications${qs(params)}`),
      get: (id) => request('GET', `/applications/${id}`),
      create: (data) => request('POST', '/applications', data),
      patch: (id, data) => request('PATCH', `/applications/${id}`, data),
      remove: (id) => request('DELETE', `/applications/${id}`),
    },
    companies: {
      list: (params) => request('GET', `/companies${qs(params)}`),
      get: (id) => request('GET', `/companies/${id}`),
      create: (data) => request('POST', '/companies', data),
      update: (id, data) => request('PUT', `/companies/${id}`, data),
      remove: (id) => request('DELETE', `/companies/${id}`),
    },
    auth: {
      register: (data) => request('POST', '/auth/register', data),
      login: (data) => request('POST', '/auth/login', data),
      logout: () => request('POST', '/auth/logout'),
      me: () => request('GET', '/auth/me'),
    },
    students: {
      me: () => request('GET', '/students/me'),
      updateMe: (data) => request('PUT', '/students/me', data),
      myApplications: () => request('GET', '/students/me/applications'),
      deleteMe: () => request('DELETE', '/students/me'),
      get: (id) => request('GET', `/students/${id}`),
      alerts: () => request('GET', '/students/me/alerts'),
      createAlert: (data) => request('POST', '/students/me/alerts', data),
      removeAlert: (id) => request('DELETE', `/students/me/alerts/${id}`),
      uploadCv: (data) => request('PUT', '/students/me/cv', data),
      deleteCv: () => request('DELETE', '/students/me/cv'),
      cvUrl: (id) => `${API_BASE}/students/${id}/cv`,
    },
  };

  /* --- Login-Status (Session-Cookie, von jeder Seite abgefragt) ---------- */

  // The session cookie is HttpOnly, so the logged-in user is fetched once per
  // page load. `userReady` lets page scripts await the result before rendering.
  let currentUser = null;
  const userReady = API.auth.me()
    .then((user) => { currentUser = user; return user; })
    .catch(() => null);

  function getUser() {
    return currentUser;
  }

  // Notifies the nav (and any page script) that the login state changed.
  function setUser(user) {
    currentUser = user;
    renderNavAuth();
    document.dispatchEvent(new CustomEvent('sw:auth', { detail: { user } }));
  }

  async function logout() {
    try { await API.auth.logout(); } catch (err) { /* session may already be gone */ }
    setUser(null);
  }

  /* --- UI-Helfer --------------------------------------------------------- */

  // Escapes user/API-supplied strings before they are inserted via innerHTML.
  // This is the central XSS guard used throughout the frontend.
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Basic client-side email format check (mirrors the server-side rule).
  function isEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());
  }

  // Formats an ISO timestamp as a short German date (e.g. "05. Jun 2026").
  function formatDate(iso) {
    try {
      return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch (err) {
      return '';
    }
  }

  // Human-friendly relative date for job cards ("heute", "gestern",
  // "vor 3 Tagen"); falls back to the full date after a week.
  function formatRelativeDate(iso) {
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
    if (Number.isNaN(days) || days < 0) return formatDate(iso);
    if (days === 0) return 'heute';
    if (days === 1) return 'gestern';
    if (days < 7) return `vor ${days} Tagen`;
    return formatDate(iso);
  }

  // True if a posting was published within the last 7 days (for the "Neu" badge).
  function isNew(iso) {
    const diff = Date.now() - new Date(iso).getTime();
    return diff >= 0 && diff < 7 * 86400000;
  }

  // Truncates text on a word boundary for previews.
  function truncate(text, max) {
    const t = String(text || '');
    if (t.length <= max) return t;
    return t.slice(0, max).replace(/\s+\S*$/, '') + '…';
  }

  // Delays a function call until input has settled (used for live search).
  function debounce(fn, wait = 300) {
    let timer;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  }

  /* --- Favoriten (Merkliste, lokal im Browser gespeichert) ---------------- */

  const FAV_KEY = 'sw-favorites';

  function getFavorites() {
    try {
      const raw = JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
      return Array.isArray(raw) ? raw.map(Number).filter(Number.isInteger) : [];
    } catch (err) {
      return [];
    }
  }

  function isFavorite(jobId) {
    return getFavorites().includes(Number(jobId));
  }

  // Adds/removes a job id and notifies listeners (e.g. the favourites filter).
  function toggleFavorite(jobId) {
    const id = Number(jobId);
    const favs = getFavorites();
    const next = favs.includes(id) ? favs.filter((f) => f !== id) : favs.concat(id);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(next)); } catch (err) { /* ignore */ }
    document.dispatchEvent(new CustomEvent('sw:favorites', { detail: { count: next.length } }));
    return next.includes(id);
  }

  function favLabel(active) {
    return active ? 'Job aus der Merkliste entfernen' : 'Job zur Merkliste hinzufügen';
  }

  // Heart toggle button; works on every page via one delegated listener below.
  function favButton(job) {
    const active = isFavorite(job.id);
    return `<button class="fav-btn" type="button" data-fav="${job.id}" aria-pressed="${active}" aria-label="${favLabel(active)}">${ICON.heart}</button>`;
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-fav]');
    if (!btn) return;
    event.preventDefault();
    const active = toggleFavorite(btn.dataset.fav);
    btn.setAttribute('aria-pressed', String(active));
    btn.setAttribute('aria-label', favLabel(active));
  });

  /* --- Job-Karten (gemeinsamer Renderer für Jobsuche & Landingpage) ------ */

  // Maps a job status to its badge colour class.
  const STATUS_BADGE_CLASS = { aktiv: 'success', pausiert: 'warning', geschlossen: 'danger' };

  function typeBadge(type) {
    return `<span class="badge badge-type">${escapeHtml(type)}</span>`;
  }

  function statusBadge(status) {
    const cls = STATUS_BADGE_CLASS[status] || 'neutral';
    return `<span class="badge badge-${cls}">${escapeHtml(status)}</span>`;
  }

  // Renders one job as a linked card. Used by jobs.html and the landing page.
  function renderJobCard(job) {
    const meta = [];
    if (job.location) meta.push(`<span>${META_ICON.location}${escapeHtml(job.location)}</span>`);
    if (job.salary_range) meta.push(`<span>${META_ICON.salary}${escapeHtml(job.salary_range)}</span>`);
    // Relative date reads naturally; the exact date stays available on hover.
    meta.push(`<span title="Veröffentlicht am ${formatDate(job.created_at)}">${META_ICON.date}${formatRelativeDate(job.created_at)}</span>`);
    // Status badge only when not actively open, to keep active cards calm.
    const status = job.status === 'aktiv' ? '' : statusBadge(job.status);
    const fresh = isNew(job.created_at) ? '<span class="badge badge-new">Neu</span>' : '';
    return `
      <article class="job-card">
        <div class="tag-row">${typeBadge(job.job_type)}${fresh}${status}${favButton(job)}</div>
        <h3><a href="job-detail.html?id=${encodeURIComponent(job.id)}">${escapeHtml(job.title)}</a></h3>
        <span class="company">${escapeHtml(job.company_name)}</span>
        <p class="text-muted mb-0">${escapeHtml(truncate(job.description, 130))}</p>
        <div class="meta">${meta.join('')}</div>
      </article>`;
  }

  // --- Form validation display helpers ---
  // Convention: each field <input name="x"> pairs with <span id="err-x">.

  function setFieldError(form, name, message) {
    const field = form.elements[name];
    if (!field) return;
    const group = field.closest('.form-group');
    if (group) group.classList.add('has-error');
    const errEl = document.getElementById(`err-${name}`);
    if (errEl) errEl.textContent = message;
    field.setAttribute('aria-invalid', 'true');
  }

  function clearFieldErrors(form) {
    form.querySelectorAll('.form-group.has-error').forEach((g) => g.classList.remove('has-error'));
    form.querySelectorAll('[aria-invalid]').forEach((f) => f.removeAttribute('aria-invalid'));
  }

  // Shows a transient toast notification. type: 'success' | 'error' | 'info'.
  function showToast(message, type = 'info', timeout = 4500) {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.setAttribute('role', 'status');
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `${ICON[type] || ICON.info}<div class="toast-msg">${escapeHtml(message)}</div>` +
      `<button class="toast-close" type="button" aria-label="Meldung schließen">${ICON.close}</button>`;
    stack.appendChild(toast);
    const timer = setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 220);
    }, timeout);
    // Manual dismiss: stop the auto-hide timer and remove immediately.
    toast.querySelector('.toast-close').addEventListener('click', () => {
      clearTimeout(timer);
      toast.remove();
    });
  }

  /* --- Flash-Meldungen (überleben eine Weiterleitung) -------------------- */
  // A normal toast is lost when the page navigates. setFlash stores a message
  // for one page load; showFlash() displays it on the next page (used e.g. for
  // the logout confirmation after redirecting to the landing page).
  const FLASH_KEY = 'sw-flash';

  function setFlash(message, type = 'info') {
    try { sessionStorage.setItem(FLASH_KEY, JSON.stringify({ message, type })); } catch (err) { /* ignore */ }
  }

  function showFlash() {
    let raw = null;
    try {
      raw = sessionStorage.getItem(FLASH_KEY);
      if (raw) sessionStorage.removeItem(FLASH_KEY);
    } catch (err) { return; }
    if (!raw) return;
    try {
      const { message, type } = JSON.parse(raw);
      if (message) showToast(message, type || 'info');
    } catch (err) { /* ignore malformed flash */ }
  }

  /* --- Theme (Light/Dark) ------------------------------------------------ */

  // Tints the browser UI (mobile address bar) to match the page background.
  function syncThemeColor() {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = document.documentElement.dataset.theme === 'dark' ? '#0f1714' : '#faf5ec';
  }
  syncThemeColor();

  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    try { localStorage.setItem('sw-theme', theme); } catch (err) { /* ignore */ }
    syncThemeColor();
  }

  function toggleTheme() {
    const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
    setTheme(current === 'dark' ? 'light' : 'dark');
  }

  /* --- Layout: Navigation + Footer (injiziert, statt HTML zu duplizieren) */

  function navHtml(activePage) {
    const link = (page, href, label) =>
      `<a href="${href}"${page === activePage ? ' class="active" aria-current="page"' : ''}>${label}</a>`;
    return `
      <div class="container">
        <nav class="nav" aria-label="Hauptnavigation">
          <a class="brand" href="index.html" aria-label="StudyWork – Zur Startseite">
            <span class="logo-mark" aria-hidden="true">${ICON.briefcase}</span>
            <span class="brand-text">Study<strong>Work</strong></span>
          </a>
          <div class="nav-links">
            ${link('jobs', 'jobs.html', 'Jobs finden')}
            ${link('company', 'company-dashboard.html', 'Für Unternehmen')}
            <span class="nav-auth" id="nav-auth"></span>
            <button class="theme-toggle" type="button" aria-label="Zwischen hellem und dunklem Design wechseln">
              ${ICON.sun}${ICON.moon}
            </button>
          </div>
        </nav>
      </div>`;
  }

  function footerHtml() {
    const year = new Date().getFullYear();
    return `
      <div class="container">
        <span>© ${year} StudyWork – Die Jobplattform für Studenten.</span>
        <span class="text-muted">Ein Projektprototyp für das Modul Internettechnologien.</span>
      </div>`;
  }

  // Fills the auth area of the nav according to the current login state.
  function renderNavAuth() {
    const el = document.getElementById('nav-auth');
    if (!el) return;
    if (currentUser) {
      const roleLabel = currentUser.role === 'company' ? 'Unternehmen' : 'Student';
      // Students get a clickable chip leading to their profile editor.
      const chip = currentUser.role === 'student'
        ? `<a class="nav-user nav-user-link" href="profile.html" title="Mein Profil (${escapeHtml(currentUser.email)})">
             ${ICON.user}<span class="nav-user-name">${escapeHtml(currentUser.name)}</span>
           </a>`
        : `<span class="nav-user" title="${escapeHtml(currentUser.email)} (${roleLabel})">
             ${ICON.user}<span class="nav-user-name">${escapeHtml(currentUser.name)}</span>
           </span>`;
      el.innerHTML = `
        ${chip}
        <button class="btn btn-ghost btn-sm" type="button" id="nav-logout" aria-label="Abmelden">${ICON.logout}<span class="nav-logout-text">Abmelden</span></button>`;
      el.querySelector('#nav-logout').addEventListener('click', async (event) => {
        const btn = event.currentTarget;
        btn.disabled = true;
        await logout();
        setFlash('Du wurdest abgemeldet.', 'success');
        // Always return to the public landing page so no protected content
        // (e.g. a profile or the dashboard) stays visible after logging out.
        window.location.href = 'index.html';
      });
    } else {
      const active = document.body.dataset.page;
      el.innerHTML = `
        <a href="login.html"${active === 'login' ? ' class="active" aria-current="page"' : ''}>Anmelden</a>
        <a class="btn btn-primary btn-sm" href="register.html">Registrieren</a>`;
    }
  }

  // Floating "back to top" button: appears after scrolling down a bit and
  // scrolls smoothly to the top. Injected once, available on every page.
  function mountScrollTop() {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'scroll-top';
    btn.setAttribute('aria-label', 'Nach oben scrollen');
    btn.innerHTML = ICON.arrowUp;
    btn.addEventListener('click', () => {
      const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
    document.body.appendChild(btn);

    const onScroll = () => btn.classList.toggle('is-visible', window.scrollY > 500);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Renders header + footer into their placeholders and wires up the toggle.
  // The active page is read from <body data-page="...">.
  function mountChrome() {
    const page = document.body.dataset.page || '';
    const header = document.getElementById('site-header');
    if (header) header.innerHTML = navHtml(page);
    const footer = document.getElementById('site-footer');
    if (footer) footer.innerHTML = footerHtml();
    const toggle = document.querySelector('.theme-toggle');
    if (toggle) toggle.addEventListener('click', toggleTheme);
    renderNavAuth();
    // Re-render once the session lookup has finished.
    userReady.then(renderNavAuth);
    mountScrollTop();
    // Show a flash message carried over from the previous page (e.g. logout).
    showFlash();
  }

  document.addEventListener('DOMContentLoaded', mountChrome);

  /* --- Öffentliche Schnittstelle ----------------------------------------- */
  return {
    API, request, escapeHtml, showToast, setTheme, toggleTheme, ICON, META_ICON,
    isEmail, formatDate, formatRelativeDate, isNew, truncate, debounce, setFieldError, clearFieldErrors,
    typeBadge, statusBadge, renderJobCard,
    getFavorites, isFavorite, toggleFavorite, favButton,
    getUser, setUser, logout, userReady, setFlash,
  };
})();

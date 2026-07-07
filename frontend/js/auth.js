'use strict';

(function () {
  const {
    API, showToast, isEmail, setFieldError, clearFieldErrors, setUser, userReady, setFlash,
  } = window.StudyWork;

  const PASSWORD_MIN_LENGTH = 8;

  function selectedRole(form) {
    return new FormData(form).get('role') === 'company' ? 'company' : 'student';
  }

  function redirectByRole(role) {
    window.location.href = role === 'company' ? 'company-dashboard.html' : 'jobs.html';
  }

  function setBusy(button, busy, busyText, idleText) {
    button.disabled = busy;
    button.textContent = busy ? busyText : idleText;
  }

  document.addEventListener('click', (event) => {
    const btn = event.target.closest('.pw-toggle');
    if (!btn) return;
    const input = btn.closest('.pw-wrap').querySelector('input');
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.setAttribute('aria-pressed', String(show));
    btn.setAttribute('aria-label', show ? 'Passwort verbergen' : 'Passwort anzeigen');
  });

  /* --- Seite: Anmelden ---------------------------------------------------- */

  function initLogin() {
    const form = document.getElementById('login-form');

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(form);

      const role = selectedRole(form);
      const email = form.email.value.trim();
      const password = form.password.value;

      let invalid = false;
      if (!email) { setFieldError(form, 'email', 'Bitte gib deine E-Mail-Adresse an.'); invalid = true; }
      else if (!isEmail(email)) { setFieldError(form, 'email', 'Diese E-Mail-Adresse ist ungültig.'); invalid = true; }
      if (!password) { setFieldError(form, 'password', 'Bitte gib dein Passwort an.'); invalid = true; }
      if (invalid) return;

      const submitBtn = document.getElementById('login-submit');
      setBusy(submitBtn, true, 'Anmelden…', 'Anmelden');
      try {
        const user = await API.auth.login({ role, email, password });
        setUser(user);
        setFlash(`Willkommen zurück, ${user.name}!`, 'success');
        redirectByRole(user.role);
      } catch (err) {
        showToast(err.message, 'error');
        setBusy(submitBtn, false, 'Anmelden…', 'Anmelden');
      }
    });
  }

  /* --- Seite: Registrieren ------------------------------------------------ */

  function initRegister() {
    const form = document.getElementById('register-form');
    const companyFields = document.getElementById('company-fields');
    const nameLabel = document.getElementById('reg-name-label');

    function applyRole() {
      const isCompany = selectedRole(form) === 'company';
      companyFields.hidden = !isCompany;
      nameLabel.innerHTML = `${isCompany ? 'Unternehmensname' : 'Name'} <span class="required" aria-hidden="true">*</span>`;
    }
    form.querySelectorAll('input[name="role"]').forEach((radio) => {
      radio.addEventListener('change', applyRole);
    });
    applyRole();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      clearFieldErrors(form);

      const role = selectedRole(form);
      const name = form.name.value.trim();
      const email = form.email.value.trim();
      const password = form.password.value;
      const password2 = form.password2.value;

      let invalid = false;
      if (!name) {
        setFieldError(form, 'name', role === 'company' ? 'Bitte gib den Unternehmensnamen an.' : 'Bitte gib deinen Namen an.');
        invalid = true;
      }
      if (!email) { setFieldError(form, 'email', 'Bitte gib eine E-Mail-Adresse an.'); invalid = true; }
      else if (!isEmail(email)) { setFieldError(form, 'email', 'Diese E-Mail-Adresse ist ungültig.'); invalid = true; }
      if (password.length < PASSWORD_MIN_LENGTH) {
        setFieldError(form, 'password', `Das Passwort muss mindestens ${PASSWORD_MIN_LENGTH} Zeichen lang sein.`);
        invalid = true;
      }
      if (password2 !== password) {
        setFieldError(form, 'password2', 'Die Passwörter stimmen nicht überein.');
        invalid = true;
      }
      if (invalid) return;

      const data = { role, name, email, password };
      if (role === 'company') {
        const description = form.description.value.trim();
        let website = form.website.value.trim();
        if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
        if (description) data.description = description;
        if (website) data.website = website;
      }

      const submitBtn = document.getElementById('register-submit');
      setBusy(submitBtn, true, 'Konto wird erstellt…', 'Konto erstellen');
      try {
        const user = await API.auth.register(data);
        setUser(user);
        setFlash(`Willkommen bei StudyWork, ${user.name}!`, 'success');
        redirectByRole(user.role);
      } catch (err) {
        showToast(err.message, 'error');
        setBusy(submitBtn, false, 'Konto wird erstellt…', 'Konto erstellen');
      }
    });
  }

  /* --- Router -------------------------------------------------------------- */

  document.addEventListener('DOMContentLoaded', async () => {
    const user = await userReady;
    if (user) {
      redirectByRole(user.role);
      return;
    }
    const page = document.body.dataset.page;
    if (page === 'login') initLogin();
    else if (page === 'register') initRegister();
  });
})();

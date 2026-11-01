// /login: email + password, and "forgot password" (reset link by email).
// After logging in, the visitor goes back to the page they came from (?next=...).
import { startPage } from '../layout.js';
import { t } from '../i18n.js';
import { getSupabase, getCurrentUser, safeNext, errorKey } from '../auth.js';
import { validateForm, clearErrorsOnInput, email, required, setBusy, showMessage } from '../forms.js';

startPage(async () => {
  const params = new URLSearchParams(location.search);
  const next = safeNext(params.get('next'));
  const form = document.getElementById('login-form');
  const resetForm = document.getElementById('reset-form');
  const toggle = document.getElementById('forgot-toggle');
  const notice = document.getElementById('login-notice');
  const formError = document.getElementById('login-error');

  // Why the visitor was sent here
  if (params.get('reason') === 'admin') showMessage(notice, t('auth.adminOnly'));
  else if (params.get('next')) showMessage(notice, t('auth.loginRequired'));

  // Already logged in (and not sent here for lacking admin rights)? Go straight on.
  if (params.get('reason') !== 'admin') {
    const current = await getCurrentUser().catch(() => null);
    if (current) {
      location.replace(next);
      return;
    }
  }

  clearErrorsOnInput(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(formError, '');
    if (!validateForm(form, { email, password: required })) return;

    const button = form.querySelector('[type="submit"]');
    setBusy(button, true, t('auth.loggingIn'));
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.signInWithPassword({
        email: form.elements.email.value.trim(),
        password: form.elements.password.value,
      });
      if (error) throw error;
      location.href = next;
    } catch (error) {
      showMessage(formError, t(errorKey(error)));
      setBusy(button, false);
    }
  });

  // "Forgot password?" opens a second small form under the first one
  toggle.addEventListener('click', () => {
    const open = resetForm.hidden;
    resetForm.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    if (open) {
      resetForm.elements.email.value = form.elements.email.value;
      resetForm.elements.email.focus();
    }
  });

  clearErrorsOnInput(resetForm);
  resetForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const resetError = document.getElementById('reset-error');
    const sent = document.getElementById('reset-sent');
    showMessage(resetError, '');
    showMessage(sent, '');
    if (!validateForm(resetForm, { email })) return;

    const button = resetForm.querySelector('[type="submit"]');
    setBusy(button, true, t('auth.sending'));
    try {
      const supabase = await getSupabase();
      const { error } = await supabase.auth.resetPasswordForEmail(resetForm.elements.email.value.trim(), {
        redirectTo: `${location.origin}/reset-password`,
      });
      if (error) throw error;
      // Same message whether or not the email exists, so nobody can test which emails are registered
      showMessage(sent, t('auth.resetSent'));
    } catch (error) {
      showMessage(resetError, t(errorKey(error)));
    } finally {
      setBusy(button, false);
    }
  });
});

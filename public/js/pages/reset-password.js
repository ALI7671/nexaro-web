// /reset-password: the "forgot password" email links here. supabase-js reads the
// one-time login from the URL; then the user chooses a new password.
import { startPage } from '../layout.js';
import { t } from '../i18n.js';
import { getSupabase, errorKey } from '../auth.js';
import { validateForm, clearErrorsOnInput, password, setBusy, showMessage } from '../forms.js';

startPage(async () => {
  const form = document.getElementById('new-password-form');

  function showResult(textKey, href, labelKey) {
    form.hidden = true;
    document.getElementById('reset-result-text').textContent = t(textKey);
    document.getElementById('reset-result-link').href = href;
    document.getElementById('reset-result-label').textContent = t(labelKey);
    document.getElementById('reset-result').hidden = false;
  }

  const supabase = await getSupabase().catch(() => null);
  const session = supabase && (await supabase.auth.getSession()).data.session;
  if (!session || /error_description=/.test(location.hash)) {
    showResult('auth.resetInvalid', '/login', 'auth.backToLogin');
    return;
  }
  form.hidden = false;

  const matches = (value) => (value === form.elements.password.value.trim() ? '' : 'form.errors.passwordMismatch');
  clearErrorsOnInput(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formError = document.getElementById('new-password-form-error');
    showMessage(formError, '');
    if (!validateForm(form, { password, confirm: matches })) return;

    const button = form.querySelector('[type="submit"]');
    setBusy(button, true, t('account.saving'));
    try {
      const { error } = await supabase.auth.updateUser({ password: form.elements.password.value });
      if (error) throw error;
      showResult('auth.resetDone', '/account', 'auth.goToAccount');
    } catch (error) {
      showMessage(formError, t(errorKey(error)));
      setBusy(button, false);
    }
  });
});

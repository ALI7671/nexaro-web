// /signup: customer account (name, phone, city, email, password).
// The name, phone and city travel with the signup; the database trigger in
// supabase/schema.sql copies them into the new profile.
import { startPage } from '../layout.js';
import { t, localize } from '../i18n.js';
import { getLookups } from '../data.js';
import { getSupabase, errorKey } from '../auth.js';
import { validateForm, clearErrorsOnInput, required, phone, email, password, setBusy, showMessage } from '../forms.js';
import { escapeHtml } from '../utils.js';

startPage(async () => {
  const form = document.getElementById('signup-form');
  const formError = document.getElementById('signup-error');

  const { cities } = await getLookups();
  document.getElementById('city-options').innerHTML = cities
    .map((city) => `<option value="${escapeHtml(localize(city.name))}"></option>`).join('');

  clearErrorsOnInput(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(formError, '');
    if (!validateForm(form, { fullName: required, phone, city: required, email, password })) return;

    const value = (name) => form.elements[name].value.trim();
    const button = form.querySelector('[type="submit"]');
    setBusy(button, true, t('auth.creating'));
    try {
      const supabase = await getSupabase();
      const { data, error } = await supabase.auth.signUp({
        email: value('email'),
        password: form.elements.password.value,
        options: {
          data: { full_name: value('fullName'), phone: value('phone'), city: value('city') },
          emailRedirectTo: `${location.origin}/account`, // the confirmation link opens their account
        },
      });
      if (error) throw error;

      // If email confirmation is off in Supabase, they're logged in straight away
      if (data.session) {
        location.href = '/account';
        return;
      }
      form.hidden = true;
      document.getElementById('signup-done-text').textContent = t('auth.checkEmailText', { email: value('email') });
      const done = document.getElementById('signup-done');
      done.hidden = false;
      done.focus();
    } catch (error) {
      showMessage(formError, t(errorKey(error)));
      setBusy(button, false);
    }
  });
});

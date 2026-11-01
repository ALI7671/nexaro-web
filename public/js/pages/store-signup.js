// /store-signup: create an account AND apply as a store, in one form.
//
// New visitors: the store details travel with the signup, and the database trigger
// creates the application (this works even before they confirm their email).
// Already logged in: only the store part shows, and the application is saved directly
// (Row Level Security only lets them save it under their own account, as 'pending').
import { startPage } from '../layout.js';
import { t, localize } from '../i18n.js';
import { getLookups } from '../data.js';
import { getSupabase, getCurrentUser, errorKey } from '../auth.js';
import {
  validateForm, clearErrorsOnInput, required, phone, email, password, instagram, setBusy, showMessage,
} from '../forms.js';
import { escapeHtml } from '../utils.js';

startPage(async () => {
  const form = document.getElementById('store-form');
  const formError = document.getElementById('store-error');

  const [{ cities }, current] = await Promise.all([getLookups(), getCurrentUser().catch(() => null)]);
  document.getElementById('city-options').innerHTML = cities
    .map((city) => `<option value="${escapeHtml(localize(city.name))}"></option>`).join('');

  // Logged in: skip the account fields and prefill what we already know
  if (current) {
    document.getElementById('account-section').hidden = true;
    document.getElementById('store-alt').hidden = true;
    showMessage(document.getElementById('logged-in-note'), t('storeSignup.loggedInAs', { email: current.user.email }));
    form.elements.city.value = current.profile?.city ?? '';
    form.elements.phone.value = current.profile?.phone ?? '';
  }

  clearErrorsOnInput(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(formError, '');
    const accountRules = current ? {} : { fullName: required, email, password };
    if (!validateForm(form, { ...accountRules, storeName: required, city: required, phone, instagram })) return;

    const value = (name) => form.elements[name].value.trim();
    const store = {
      store_name: value('storeName'),
      city: value('city'),
      phone: value('phone'),
      instagram: value('instagram') || null,
      description: value('description') || null,
    };

    const button = form.querySelector('[type="submit"]');
    setBusy(button, true, t('storeSignup.sending'));
    try {
      const supabase = await getSupabase();
      let needsConfirmation = false;

      if (current) {
        const { error } = await supabase.from('store_applications').insert({ ...store, user_id: current.user.id });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: value('email'),
          password: form.elements.password.value,
          options: {
            // account_type 'store' tells the trigger to create the application.
            // (It never sets the role: every account starts as 'customer'.)
            data: { full_name: value('fullName'), phone: store.phone, city: store.city, account_type: 'store', ...store },
            emailRedirectTo: `${location.origin}/account`,
          },
        });
        if (error) throw error;
        needsConfirmation = !data.session;
      }

      form.hidden = true;
      document.getElementById('logged-in-note').hidden = true;
      document.getElementById('store-alt').hidden = true;
      if (needsConfirmation) {
        showMessage(document.getElementById('store-done-email'), t('storeSignup.confirmEmail', { email: value('email') }));
        document.getElementById('store-done-link').hidden = true;
      }
      const done = document.getElementById('store-done');
      done.hidden = false;
      done.focus();
    } catch (error) {
      showMessage(formError, t(errorKey(error)));
      setBusy(button, false);
    }
  });
});

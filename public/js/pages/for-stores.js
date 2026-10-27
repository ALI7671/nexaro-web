// For Stores page: a WhatsApp link for store owners, and the application form.
// The form is validated here, then handed to the data layer. Phase 1 only shows
// a success message; Phase 2 saves it to Supabase (see data.js).
import { startPage } from '../layout.js';
import { getLookups, submitStoreApplication } from '../data.js';
import { t, localize } from '../i18n.js';
import { validateForm, clearErrorsOnInput, required } from '../forms.js';
import { escapeHtml, whatsappLink } from '../utils.js';

// Palestinian mobile numbers: 059/056 + 7 digits, optionally with +970 / +972 / 00970
const PHONE_PATTERN = /^(?:(?:\+|00)?97[02]|0)5[69]\d{7}$/;
// "@yourstore", "yourstore" or an instagram.com/yourstore link
const INSTAGRAM_PATTERN = /^(?:@?[\w.]{1,30}|(?:https?:\/\/)?(?:www\.)?instagram\.com\/[\w.]{1,30}\/?(?:\?.*)?)$/i;

startPage(async () => {
  const form = document.getElementById('join-form');
  const success = document.getElementById('join-success');
  const formError = document.getElementById('join-form-error');
  const submit = form.querySelector('[type="submit"]');

  document.getElementById('stores-whatsapp').href = whatsappLink(t('forStores.whatsappMessage'));

  const { cities } = await getLookups();
  document.getElementById('city-options').innerHTML = cities
    .map((city) => `<option value="${escapeHtml(localize(city.name))}"></option>`)
    .join('');

  clearErrorsOnInput(form);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    formError.hidden = true;

    const valid = validateForm(form, {
      storeName: required,
      ownerName: required,
      city: required,
      phone: (value) => {
        if (!value) return 'form.errors.required';
        return PHONE_PATTERN.test(value.replace(/[\s\-()]/g, '')) ? '' : 'form.errors.phone';
      },
      instagram: (value) => (!value || INSTAGRAM_PATTERN.test(value) ? '' : 'form.errors.instagram'),
    });
    if (!valid) return;

    submit.disabled = true;
    submit.textContent = t('join.sending');

    try {
      const application = Object.fromEntries(
        [...new FormData(form)].map(([key, value]) => [key, String(value).trim()]),
      );
      await submitStoreApplication(application);
      form.hidden = true;
      success.hidden = false;
      success.querySelector('h2').focus();
    } catch (error) {
      console.error(error);
      formError.textContent = t('form.errors.generic');
      formError.hidden = false;
      submit.disabled = false;
      submit.textContent = t('join.submit');
    }
  });
});

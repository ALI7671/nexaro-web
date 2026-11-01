// /account: the logged-in user's profile (editable name, phone, city), their store
// application status, and sign out. Visitors who aren't logged in go to /login.
import { startPage } from '../layout.js';
import { t, localize } from '../i18n.js';
import { getLookups } from '../data.js';
import { getSupabase, requireUser, displayName, signOut, errorKey } from '../auth.js';
import { validateForm, clearErrorsOnInput, required, phone, setBusy, showMessage } from '../forms.js';
import { escapeHtml, formatDate } from '../utils.js';

const optionalPhone = (value) => (value ? phone(value) : '');

startPage(async () => {
  const current = await requireUser();
  const { user, profile } = current;
  const supabase = await getSupabase();
  const form = document.getElementById('profile-form');

  document.getElementById('account-hello').textContent = t('account.hello', { name: displayName(current) });
  document.getElementById('account-email').textContent = user.email;
  form.elements.fullName.value = profile?.full_name ?? '';
  form.elements.phone.value = profile?.phone ?? '';
  form.elements.city.value = profile?.city ?? '';
  const role = profile?.role ?? 'customer';
  document.getElementById('profile-role').textContent = t(`account.role${role[0].toUpperCase()}${role.slice(1)}`);
  document.getElementById('admin-box').hidden = role !== 'admin';
  document.getElementById('dashboard-box').hidden = role !== 'store';

  const { cities } = await getLookups();
  document.getElementById('city-options').innerHTML = cities
    .map((city) => `<option value="${escapeHtml(localize(city.name))}"></option>`).join('');

  await showApplication(supabase, user.id, role);

  document.getElementById('sign-out').addEventListener('click', signOut);

  clearErrorsOnInput(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formError = document.getElementById('profile-error');
    const saved = document.getElementById('profile-saved');
    showMessage(formError, '');
    showMessage(saved, '');
    if (!validateForm(form, { fullName: required, phone: optionalPhone })) return;

    const button = form.querySelector('[type="submit"]');
    setBusy(button, true, t('account.saving'));
    try {
      // Only name, phone and city: the role can't be changed here (the database blocks it too)
      const changes = {
        full_name: form.elements.fullName.value.trim(),
        phone: form.elements.phone.value.trim() || null,
        city: form.elements.city.value.trim() || null,
      };
      const { error } = await supabase.from('profiles').update(changes).eq('id', user.id);
      if (error) throw error;
      document.getElementById('account-hello').textContent = t('account.hello', { name: changes.full_name });
      showMessage(saved, t('account.saved'));
    } catch (error) {
      showMessage(formError, t(errorKey(error)));
    } finally {
      setBusy(button, false);
    }
  });
});

// The user's latest store application, if any (Row Level Security returns only their own)
async function showApplication(supabase, userId, role) {
  const { data, error } = await supabase
    .from('store_applications')
    .select('store_name, status, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) throw error;

  const application = data[0];
  document.getElementById('apply-box').hidden = Boolean(application) || role !== 'customer';
  if (!application) return;

  const statusText = {
    pending: t('storeSignup.pendingText'),
    approved: t('account.approvedText'),
    rejected: t('account.rejectedText'),
  };
  const statusLabel = t(`account.status${application.status[0].toUpperCase()}${application.status.slice(1)}`);
  document.getElementById('application-store').textContent = application.store_name;
  const badge = document.getElementById('application-status');
  badge.textContent = statusLabel;
  badge.dataset.status = application.status;
  document.getElementById('application-text').textContent = statusText[application.status];
  document.getElementById('application-date').textContent = t('account.sentOn', { date: formatDate(application.created_at) });
  document.getElementById('application-box').hidden = false;
}

// /admin/applications: admins review store applications (Approve / Reject).
// The page sends non-admins to /login, but the database is the real lock:
// RLS only returns applications to admins, and review_application() checks too.
import { startPage } from '../layout.js';
import { t } from '../i18n.js';
import { getSupabase, requireUser, errorKey } from '../auth.js';
import { icon } from '../components.js';
import { escapeHtml, formatDate, instagramProfile } from '../utils.js';
import { showMessage } from '../forms.js';

const STATUSES = ['pending', 'approved', 'rejected'];
const capitalize = (word) => word[0].toUpperCase() + word.slice(1);

let supabase;
let applications = [];
let filter = 'pending';

startPage(async () => {
  await requireUser({ admin: true });
  supabase = await getSupabase();

  document.getElementById('status-filter').addEventListener('click', (event) => {
    const button = event.target.closest('[data-status]');
    if (!button) return;
    filter = button.dataset.status;
    render();
  });
  document.getElementById('application-list').addEventListener('click', onReview);

  await load();
});

async function load() {
  // profiles(full_name) pulls in the applicant's name through the user_id link
  const { data, error } = await supabase
    .from('store_applications')
    .select('id, store_name, city, phone, instagram, description, status, created_at, profiles(full_name)')
    .order('created_at', { ascending: false });
  if (error) {
    showMessage(document.getElementById('admin-error'), t(errorKey(error)));
    return;
  }
  applications = data;
  render();
}

function render() {
  const count = (status) => applications.filter((a) => status === 'all' || a.status === status).length;
  document.getElementById('status-filter').innerHTML = [...STATUSES, 'all'].map((status) => `
    <button class="pill" type="button" data-status="${status}" aria-pressed="${status === filter}">
      ${status === 'all' ? t('admin.all') : t(`account.status${capitalize(status)}`)} (${count(status)})
    </button>`).join('');

  const visible = applications.filter((a) => filter === 'all' || a.status === filter);
  document.getElementById('application-list').innerHTML = visible.length
    ? visible.map(applicationCard).join('')
    : `<p class="empty-state">${t('admin.empty')}</p>`;
}

// Everything that came from an applicant is escaped before it goes into the page
function applicationCard(app) {
  const instagram = instagramProfile(app.instagram);
  const whatsapp = whatsappNumber(app.phone);
  const actions = ['approved', 'rejected']
    .filter((status) => status !== app.status)
    .map((status) => `
      <button class="btn btn--small${status === 'approved' ? ' btn--solid' : ''}" type="button"
        data-review="${status}" data-id="${app.id}" data-store="${escapeHtml(app.store_name)}">
        ${t(status === 'approved' ? 'admin.approve' : 'admin.reject')}
      </button>`).join('');

  return `
    <article class="application-card">
      <div class="application-card__head">
        <div>
          <h3 class="application-card__name">${escapeHtml(app.store_name)}</h3>
          <p class="application-card__meta"><bdi>${escapeHtml(app.city)}</bdi> · <bdi>${formatDate(app.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</bdi></p>
        </div>
        <span class="status-badge" data-status="${app.status}">${t(`account.status${capitalize(app.status)}`)}</span>
      </div>
      <dl class="application-card__details">
        <div><dt>${t('admin.applicant')}</dt><dd>${escapeHtml(app.profiles?.full_name || '—')}</dd></div>
        <div><dt>${t('auth.phone')}</dt><dd>
          <a class="text-link" href="tel:${escapeHtml(app.phone.replace(/[^\d+]/g, ''))}" dir="ltr">${escapeHtml(app.phone)}</a>
          ${whatsapp ? ` · <a class="text-link" href="https://wa.me/${whatsapp}" target="_blank" rel="noopener">${t('admin.whatsapp')}</a>` : ''}
        </dd></div>
        <div><dt>${t('join.instagram')}</dt><dd>${instagram
          ? `<a class="text-link" href="${instagram.url}" target="_blank" rel="noopener" dir="ltr">@${escapeHtml(instagram.handle)}</a>`
          : '—'}</dd></div>
        ${app.description ? `<div class="application-card__wide"><dt>${t('storeSignup.description')}</dt><dd>${escapeHtml(app.description)}</dd></div>` : ''}
      </dl>
      <div class="application-card__actions">${actions}</div>
    </article>`;
}

async function onReview(event) {
  const button = event.target.closest('[data-review]');
  if (!button) return;
  const { id, review, store } = button.dataset;
  const status = document.getElementById('admin-status');
  const errorBox = document.getElementById('admin-error');
  showMessage(errorBox, '');
  button.closest('.application-card__actions').querySelectorAll('button').forEach((b) => { b.disabled = true; });

  // One database call does both steps: status, and (when approving) the user's role = 'store'
  const { error } = await supabase.rpc('review_application', { application_id: id, new_status: review });
  if (error) {
    showMessage(errorBox, t(errorKey(error)));
    render();
    return;
  }
  applications.find((a) => a.id === id).status = review;
  status.textContent = t(review === 'approved' ? 'admin.approvedDone' : 'admin.rejectedDone', { store });
  render();
}


// Palestinian mobile in any common format → the international number WhatsApp needs
function whatsappNumber(value) {
  const digits = value.replace(/\D/g, '');
  if (/^05[69]\d{7}$/.test(digits)) return `970${digits.slice(1)}`;
  if (/^(970|972)5[69]\d{7}$/.test(digits)) return digits;
  if (/^00(970|972)5[69]\d{7}$/.test(digits)) return digits.slice(2);
  return null;
}

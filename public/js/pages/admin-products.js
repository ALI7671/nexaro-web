// /admin/products: admins review products that stores sent for review.
// Publish → status 'published' (everyone sees it). Reject → status 'rejected' with a
// short reason that the store sees in its dashboard. Drafts stay private to the store.
import { startPage } from '../layout.js';
import { t, localize } from '../i18n.js';
import { getLookups } from '../data.js';
import { getSupabase, requireUser, errorKey } from '../auth.js';
import { sizeLabel, verifiedBadge, priceHtml, madeBadge } from '../components.js';
import { escapeHtml, formatDate, storeUrl } from '../utils.js';
import { showMessage } from '../forms.js';

const STATUSES = ['pending', 'published', 'rejected'];
const capitalize = (word) => word[0].toUpperCase() + word.slice(1);

let supabase;
let lookups;
let products = [];
let filter = 'pending';

startPage(async () => {
  await requireUser({ admin: true });
  supabase = await getSupabase();
  lookups = await getLookups();

  document.getElementById('status-filter').addEventListener('click', (event) => {
    const button = event.target.closest('[data-status]');
    if (!button) return;
    filter = button.dataset.status;
    render();
  });
  document.getElementById('review-list').addEventListener('click', onClick);
  await load();
});

async function load() {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_images(url, position), stores(name, slug, verified)')
    .in('status', STATUSES)
    .order('updated_at', { ascending: false });
  if (error) {
    showMessage(document.getElementById('review-error'), t(errorKey(error)));
    return;
  }
  products = data;
  render();
}

function render() {
  const count = (status) => products.filter((p) => p.status === status).length;
  document.getElementById('status-filter').innerHTML = STATUSES.map((status) => `
    <button class="pill" type="button" data-status="${status}" aria-pressed="${status === filter}">
      ${t(`dash.status${capitalize(status)}`)} (${count(status)})
    </button>`).join('');

  const visible = products.filter((p) => p.status === filter);
  document.getElementById('review-list').innerHTML = visible.length
    ? visible.map(reviewCard).join('')
    : `<p class="empty-state">${t('adminProducts.empty')}</p>`;
}

// Names from lookups.json for ids stored in the database
const nameIn = (list, id) => localize(lookups[list].find((item) => item.id === id)?.name) || id;

// Everything here came from a store, so it's all escaped
function reviewCard(p) {
  const images = [...(p.product_images ?? [])].sort((a, b) => a.position - b.position);
  const store = p.stores ?? {};
  const list = (values, format) => (values?.length ? values.map((v) => escapeHtml(format(v))).join(' · ') : '—');
  const actions = [];
  if (p.status !== 'published') actions.push(`<button class="btn btn--small btn--solid" type="button" data-publish="${p.id}">${t('adminProducts.publish')}</button>`);
  if (p.status !== 'rejected') actions.push(`<button class="btn btn--small" type="button" data-reject="${p.id}">${t('adminProducts.reject')}</button>`);

  return `
    <article class="review-card" data-id="${p.id}">
      <div class="review-card__images">
        ${images.length ? images.map((image) => `<img src="${escapeHtml(image.url)}" alt="" loading="lazy">`).join('') : `<p class="muted">${t('adminProducts.noImages')}</p>`}
      </div>
      <div class="review-card__body">
        <div class="application-card__head">
          <div>
            <h3 class="application-card__name"><bdi>${escapeHtml(p.name_ar || '—')}</bdi></h3>
            <p class="review-card__en" dir="ltr">${escapeHtml(p.name_en || '—')}</p>
          </div>
          <span class="status-badge" data-status="${p.status}">${t(`dash.status${capitalize(p.status)}`)}</span>
        </div>
        <p class="application-card__meta">
          ${store.slug ? `<a class="text-link" href="${storeUrl(store)}"><bdi>${escapeHtml(store.name)}</bdi></a>` : '—'} ${verifiedBadge(store, { compact: true })}
          · <bdi>${formatDate(p.updated_at, { dateStyle: 'medium', timeStyle: 'short' })}</bdi>
        </p>
        ${priceHtml({ price: p.price === null ? null : Number(p.price), compareAtPrice: p.compare_at_price === null ? null : Number(p.compare_at_price) }, 'review-card__price')}
        ${madeBadge({ madeInPalestine: p.made_in_palestine })}
        <dl class="application-card__details">
          <div><dt>${t('dash.section')}</dt><dd>${p.section ? escapeHtml(nameIn('audiences', p.section)) : '—'}</dd></div>
          <div><dt>${t('shop.category')}</dt><dd>${p.category ? escapeHtml(nameIn('categories', p.category)) : '—'}</dd></div>
          <div><dt>${t('product.size')}</dt><dd>${list(p.sizes, sizeLabel)}</dd></div>
          <div><dt>${t('dash.colors')}</dt><dd>${list(p.colors, (id) => nameIn('colors', id))}</dd></div>
          <div class="application-card__wide"><dt>${t('shop.occasion')}</dt><dd>${list(p.occasions, (id) => nameIn('occasions', id))}</dd></div>
          ${p.description_ar ? `<div class="application-card__wide"><dt>${t('dash.descAr')}</dt><dd dir="rtl">${escapeHtml(p.description_ar)}</dd></div>` : ''}
          ${p.description_en ? `<div class="application-card__wide"><dt>${t('dash.descEn')}</dt><dd dir="ltr">${escapeHtml(p.description_en)}</dd></div>` : ''}
          ${p.status === 'rejected' && p.review_note ? `<div class="application-card__wide"><dt>${t('adminProducts.reason')}</dt><dd>${escapeHtml(p.review_note)}</dd></div>` : ''}
        </dl>
        <div class="application-card__actions">${actions.join('')}
          ${p.status === 'published' ? `<a class="text-link" href="/product?id=${p.id}">${t('adminProducts.viewLive')}</a>` : ''}
        </div>
        <div class="reject-form" data-reject-form="${p.id}" hidden>
          <label class="field__label" for="reason-${p.id}">${t('adminProducts.reasonLabel')}</label>
          <textarea class="field__textarea field__textarea--short" id="reason-${p.id}" maxlength="300" aria-describedby="reason-${p.id}-error"></textarea>
          <p class="field__error" id="reason-${p.id}-error" hidden></p>
          <div class="btn-row">
            <button class="btn btn--small btn--solid" type="button" data-confirm-reject="${p.id}">${t('adminProducts.confirmReject')}</button>
            <button class="btn btn--small" type="button" data-cancel-reject="${p.id}">${t('dash.cancel')}</button>
          </div>
        </div>
      </div>
    </article>`;
}

async function onClick(event) {
  const publish = event.target.closest('[data-publish]');
  const reject = event.target.closest('[data-reject]');
  const confirm = event.target.closest('[data-confirm-reject]');
  const cancel = event.target.closest('[data-cancel-reject]');

  if (reject) {
    const box = document.querySelector(`[data-reject-form="${reject.dataset.reject}"]`);
    box.hidden = false;
    box.querySelector('textarea').focus();
  } else if (cancel) {
    document.querySelector(`[data-reject-form="${cancel.dataset.cancelReject}"]`).hidden = true;
  } else if (publish) {
    await review(publish.dataset.publish, 'published', null, publish);
  } else if (confirm) {
    const id = confirm.dataset.confirmReject;
    const field = document.getElementById(`reason-${id}`);
    const reason = field.value.trim();
    const error = document.getElementById(`reason-${id}-error`);
    if (!reason) {
      showMessage(error, t('adminProducts.reasonRequired'));
      field.setAttribute('aria-invalid', 'true');
      field.focus();
      return;
    }
    await review(id, 'rejected', reason, confirm);
  }
}

async function review(id, status, reason, button) {
  const errorBox = document.getElementById('review-error');
  showMessage(errorBox, '');
  button.disabled = true;
  const { error } = await supabase.from('products').update({ status, review_note: reason }).eq('id', id);
  if (error) {
    button.disabled = false;
    showMessage(errorBox, t(errorKey(error)));
    return;
  }
  const product = products.find((p) => p.id === id);
  Object.assign(product, { status, review_note: reason });
  document.getElementById('review-status').textContent = t(status === 'published' ? 'adminProducts.published' : 'adminProducts.rejected', {
    name: product.name_ar || product.name_en,
  });
  render();
}

// Store page template: /store/<slug>, e.g. /store/dar-alrajul
// (server.js sends store.html for every /store/... address)
import { startPage, observeReveals } from '../layout.js';
import { getStore, getStoreBySlug, getProducts, getLookups } from '../data.js';
import { t, tn, localize } from '../i18n.js';
import { productCard, storeVisual, verifiedBadge, breadcrumb, notFound, icon } from '../components.js';
import { escapeHtml, getParam, storeUrl, whatsappShareLink, copyText } from '../utils.js';

// "/store/dar-alrajul" → "dar-alrajul"; old links "/store?id=dar-alrajul" still work
async function findStore() {
  const slug = decodeURIComponent(location.pathname.match(/^\/store\/([^/]+)/)?.[1] ?? '');
  if (slug) return getStoreBySlug(slug);
  const store = await getStore(getParam('id'));
  if (store) history.replaceState(null, '', storeUrl(store)); // show the clean URL
  return store;
}

startPage(async () => {
  const root = document.getElementById('store-root');
  const store = await findStore();

  if (!store) {
    document.title = `${t('store.notFoundTitle')} | Nexaro`;
    root.innerHTML = notFound({
      title: t('store.notFoundTitle'),
      text: t('store.notFoundText'),
      href: '/stores',
      label: t('store.backToStores'),
    });
    return;
  }

  const [products, lookups] = await Promise.all([getProducts({ storeId: store.id }), getLookups()]);
  const name = localize(store.name);
  document.title = `${name} | Nexaro`;

  // Only show category buttons this store actually has
  const categories = lookups.categories.filter((category) => products.some((p) => p.category === category.id));

  root.innerHTML = `
    ${breadcrumb([{ href: '/', label: t('nav.home') }, { href: '/stores', label: t('nav.stores') }, { label: name }])}
    <section class="store-hero container">
      <div class="store-hero__visual reveal">${storeVisual(store)}</div>
      <div class="store-hero__text reveal">
        <p class="eyebrow">${escapeHtml(localize(store.cityName))}</p>
        <h1 class="page-title">${escapeHtml(name)}</h1>
        ${verifiedBadge(store)}
        <p class="lead">${escapeHtml(localize(store.bio))}</p>
        <p class="muted store-hero__count">${tn('common.pieces', products.length)}</p>
        <div class="share-row" role="group" aria-label="${t('store.share')}">
          <button class="btn btn--small" type="button" id="copy-link">${icon('link')}<span>${t('store.copyLink')}</span></button>
          <a class="btn btn--small" id="share-whatsapp" href="#" target="_blank" rel="noopener">${icon('share')}<span>${t('store.shareWhatsapp')}</span></a>
        </div>
        <input class="field__input share-url" id="share-url" type="text" dir="ltr" readonly aria-label="${t('store.copyLink')}" hidden>
        <p class="sr-only" id="share-status" role="status"></p>
      </div>
    </section>
    <section class="section section--line container" aria-labelledby="collection-title">
      <div class="section-head">
        <h2 class="section-title" id="collection-title">${t('store.collection')}</h2>
        <div class="pill-row" id="category-filter" role="group" aria-label="${t('store.filterLabel')}">
          <button class="pill" type="button" data-category="" aria-pressed="true">${t('store.all')}</button>
          ${categories.map((c) => `<button class="pill" type="button" data-category="${c.id}" aria-pressed="false">${escapeHtml(localize(c.name))}</button>`).join('')}
        </div>
      </div>
      <div class="product-grid" id="store-products"></div>
    </section>`;

  initShare(store);

  const grid = document.getElementById('store-products');
  const filter = document.getElementById('category-filter');

  function render(category) {
    const visible = category ? products.filter((p) => p.category === category) : products;
    grid.innerHTML = visible.map(productCard).join('');
    filter.querySelectorAll('[data-category]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.category === category));
    });
    observeReveals(grid);
  }

  filter.addEventListener('click', (event) => {
    const button = event.target.closest('[data-category]');
    if (button) render(button.dataset.category);
  });

  render('');
});

// "Copy link" and "Share on WhatsApp" both use the clean, shareable URL
function initShare(store) {
  const url = `${location.origin}${storeUrl(store)}`;
  const copyButton = document.getElementById('copy-link');
  const label = copyButton.querySelector('span');
  const status = document.getElementById('share-status');
  let resetTimer;

  document.getElementById('share-whatsapp').href = whatsappShareLink(t('store.shareMessage', {
    store: localize(store.name),
    city: localize(store.cityName),
    url,
  }));

  copyButton.addEventListener('click', async () => {
    const copied = await copyText(url);
    const message = t(copied ? 'store.copied' : 'store.copyFailed', { url });
    label.textContent = copied ? t('store.copied') : t('store.copyLink');
    status.textContent = message; // read out by screen readers
    if (!copied) {
      // Last resort: show the link, selected, so the user can copy it by hand
      const box = document.getElementById('share-url');
      box.value = url;
      box.hidden = false;
      box.select();
    }
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => { label.textContent = t('store.copyLink'); }, 2500);
  });
}

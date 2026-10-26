// Store page template: /store?id=<store id>
import { startPage, observeReveals } from '../layout.js';
import { getStore, getProducts, getLookups } from '../data.js';
import { t, tn, localize } from '../i18n.js';
import { productCard, storeVisual, breadcrumb, notFound } from '../components.js';
import { escapeHtml, getParam } from '../utils.js';

startPage(async () => {
  const root = document.getElementById('store-root');
  const store = await getStore(getParam('id'));

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
        <p class="lead">${escapeHtml(localize(store.bio))}</p>
        <p class="muted store-hero__count">${tn('common.pieces', products.length)}</p>
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

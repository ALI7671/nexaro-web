// HTML builders for pieces used on several pages (cards, icons, breadcrumbs...).
// Each returns a string; pages put it into the DOM with innerHTML.
import { t, tn, localize } from './i18n.js';
import { escapeHtml } from './utils.js';

const ICONS = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  menu: '<path d="M4 8h16M4 16h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  chat: '<path d="M4 20l1.4-4.2A8 8 0 1 1 8.2 18.6Z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3.5 6.5 8.5 6 8.5-6"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r="0.6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  sliders: '<path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
};

export function icon(name) {
  return `<svg class="icon icon--${name}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] ?? ''}</svg>`;
}

export function sizeLabel(size) {
  return size === 'one-size' ? t('sizes.oneSize') : size;
}

// Stores have no photos yet, so they get a typographic monogram instead
export function storeVisual(store) {
  if (store.logo) return `<img src="${escapeHtml(store.logo)}" alt="" loading="lazy">`;
  return `<span class="monogram" aria-hidden="true">${escapeHtml(store.name.en.charAt(0))}</span>`;
}

export function productCard(product, index = 0) {
  return `
    <article class="product-card reveal" style="--i:${index % 4}">
      <a class="product-card__link" href="/product?id=${encodeURIComponent(product.id)}">
        <div class="product-card__media">
          <img src="${escapeHtml(product.image)}" alt="" width="400" height="500" loading="lazy" decoding="async">
        </div>
        <div class="product-card__body">
          <p class="product-card__store">${escapeHtml(localize(product.store.name))} · ${escapeHtml(localize(product.store.cityName))}</p>
          <h3 class="product-card__name">${escapeHtml(localize(product.name))}</h3>
          <p class="product-card__price">${t('common.priceOnRequest')}</p>
        </div>
      </a>
    </article>`;
}

export function storeCard(store, index = 0) {
  return `
    <article class="store-card reveal" style="--i:${index % 3}">
      <a class="store-card__link" href="/store?id=${encodeURIComponent(store.id)}">
        <div class="store-card__media">${storeVisual(store)}</div>
        <div class="store-card__body">
          <p class="eyebrow">${escapeHtml(localize(store.cityName))} — ${tn('common.pieces', store.productCount)}</p>
          <h3 class="store-card__name">${escapeHtml(localize(store.name))}</h3>
          <p class="store-card__bio">${escapeHtml(localize(store.bio))}</p>
          <span class="link-arrow">${t('stores.visit')}${icon('arrow')}</span>
        </div>
      </a>
    </article>`;
}

export function categoryTile(category, index = 0) {
  return `
    <a class="category-tile reveal" style="--i:${index % 3}" href="/shop?category=${encodeURIComponent(category.id)}">
      <div class="category-tile__media">
        <img src="${escapeHtml(category.image)}" alt="" width="400" height="500" loading="lazy" decoding="async">
      </div>
      <div class="category-tile__body">
        <h3 class="category-tile__name">${escapeHtml(localize(category.name))}</h3>
        <span class="category-tile__count">${tn('common.pieces', category.productCount)}</span>
      </div>
    </a>`;
}

// items: [{ href, label }, ..., { label }] (the last one is the current page)
export function breadcrumb(items) {
  const links = items.map((item) => item.href
    ? `<li><a href="${item.href}">${escapeHtml(item.label)}</a></li>`
    : `<li aria-current="page">${escapeHtml(item.label)}</li>`);
  return `<nav class="breadcrumb container" aria-label="${t('a11y.breadcrumb')}"><ol>${links.join('')}</ol></nav>`;
}

export function emptyState(message, link) {
  return `
    <div class="empty-state">
      <p>${escapeHtml(message)}</p>
      ${link ? `<a class="btn" href="${link.href}">${escapeHtml(link.label)}</a>` : ''}
    </div>`;
}

export function notFound({ title, text, href, label }) {
  return `
    <section class="page-message container">
      <p class="display page-message__code latin" aria-hidden="true">404</p>
      <h1 class="page-title">${escapeHtml(title)}</h1>
      <p class="muted">${escapeHtml(text)}</p>
      <a class="btn" href="${href}">${escapeHtml(label)}</a>
    </section>`;
}

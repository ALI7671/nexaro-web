// Product page template: /product?id=<product id>
// The customer picks a color and size, then orders on WhatsApp with a ready-made message.
import { startPage, observeReveals } from '../layout.js';
import { getProduct, getProducts } from '../data.js';
import { t, localize } from '../i18n.js';
import { productCard, icon, sizeLabel, breadcrumb, notFound } from '../components.js';
import { escapeHtml, getParam, whatsappLink } from '../utils.js';

startPage(async () => {
  const root = document.getElementById('product-root');
  const product = await getProduct(getParam('id'));

  if (!product) {
    document.title = `${t('product.notFoundTitle')} | Nexaro`;
    root.innerHTML = notFound({
      title: t('product.notFoundTitle'),
      text: t('product.notFoundText'),
      href: '/shop',
      label: t('product.backToShop'),
    });
    return;
  }

  const name = localize(product.name);
  const storeName = localize(product.store.name);
  const city = localize(product.store.cityName);
  document.title = `${name} — ${storeName} | Nexaro`;

  root.innerHTML = `
    ${breadcrumb([
      { href: '/', label: t('nav.home') },
      { href: '/shop', label: t('nav.shop') },
      { href: `/shop?category=${product.category}`, label: localize(product.categoryName) },
      { label: name },
    ])}
    <article class="product container">
      <div class="product__media reveal">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(name)}" width="800" height="1000">
      </div>
      <div class="product__info">
        <a class="eyebrow product__store" href="/store?id=${encodeURIComponent(product.store.id)}">${escapeHtml(storeName)} · ${escapeHtml(city)}</a>
        <h1 class="product__name">${escapeHtml(name)}</h1>
        <p class="product__price">${t('common.priceOnRequest')}</p>
        <p class="product__price-note">${t('product.priceNote')}</p>
        <div class="pill-row product__tags">
          <a class="pill" href="/shop?audience=${product.audience}">${escapeHtml(localize(product.audienceName))}</a>
          <a class="pill" href="/shop?style=${product.style}">${escapeHtml(localize(product.styleName))}</a>
        </div>
        <p class="product__desc">${escapeHtml(localize(product.description))}</p>

        <div class="order">
          ${optionGroup('color', t('product.color'), product.colorOptions.map((c) => ({ value: c.id, label: localize(c.name) })))}
          ${optionGroup('size', t('product.size'), product.sizes.map((s) => ({ value: s, label: sizeLabel(s) })))}
          ${product.sizeGuide ? `<a class="text-link order__guide" href="/size-guide#${product.sizeGuide}">${t('product.sizeGuide')}</a>` : ''}
          <a class="btn btn--solid btn--block" id="order-button" href="#" target="_blank" rel="noopener">
            ${icon('chat')}<span>${t('product.order')}</span>
          </a>
          <p class="order__note">${t('product.orderNote')}</p>
          <ul class="trust-badges" aria-label="${t('product.trustLabel')}">
            <li><a href="/policies#payment">${icon('cash')}<span>${t('product.badgeCod')}</span></a></li>
            <li><a href="/policies#exchange">${icon('swap')}<span>${t('product.badgeExchange')}</span></a></li>
            <li><a href="/policies#delivery">${icon('truck')}<span>${t('product.badgeDelivery')}</span></a></li>
          </ul>
        </div>

        <ul class="perks">
          <li>${icon('pin')}<span>${escapeHtml(t('product.perkDelivery', { city }))}</span></li>
          <li>${icon('chat')}<span>${t('product.perkPrice')}</span></li>
          <li>${icon('check')}<span>${escapeHtml(t('product.perkStore', { store: storeName }))}</span></li>
        </ul>
      </div>
    </article>
    <section class="section section--line container" id="related" aria-labelledby="related-title" hidden>
      <div class="section-head">
        <h2 class="section-title" id="related-title">${escapeHtml(t('product.moreFrom', { store: storeName }))}</h2>
        <a class="link-arrow" href="/store?id=${encodeURIComponent(product.store.id)}">${t('common.viewAll')}${icon('arrow')}</a>
      </div>
      <div class="product-grid" id="related-grid"></div>
    </section>`;

  initOrder(root, product, { name, storeName, city });

  const related = (await getProducts({ storeId: product.storeId })).filter((p) => p.id !== product.id).slice(0, 4);
  if (related.length) {
    document.getElementById('related-grid').innerHTML = related.map(productCard).join('');
    document.getElementById('related').hidden = false;
    observeReveals(root);
  }
});

// A group of radio buttons styled as chips. With only one option it's preselected.
function optionGroup(name, legend, options) {
  const single = options.length === 1;
  return `
    <fieldset class="option-group" aria-describedby="${name}-error">
      <legend class="option-group__legend">
        <span>${legend}</span><span class="option-group__value" data-value-for="${name}">${single ? escapeHtml(options[0].label) : ''}</span>
      </legend>
      <div class="chips">
        ${options.map((option) => `
          <label class="chip">
            <input type="radio" name="${name}" value="${escapeHtml(option.value)}" data-label="${escapeHtml(option.label)}"${single ? ' checked' : ''}>
            <span>${escapeHtml(option.label)}</span>
          </label>`).join('')}
      </div>
      <p class="field__error" id="${name}-error" hidden></p>
    </fieldset>`;
}

function initOrder(root, product, { name, storeName, city }) {
  const button = document.getElementById('order-button');
  const selected = (group) => root.querySelector(`input[name="${group}"]:checked`);

  function setError(group, message) {
    const error = document.getElementById(`${group}-error`);
    error.textContent = message;
    error.hidden = !message;
  }

  // The link always holds the latest message, so it works with a normal click or a long-press
  function updateLink() {
    const message = t('product.whatsappMessage', {
      product: name,
      store: storeName,
      city,
      color: selected('color')?.dataset.label ?? '—',
      size: selected('size')?.dataset.label ?? '—',
      url: `${location.origin}/product?id=${encodeURIComponent(product.id)}`,
    });
    button.href = whatsappLink(message);
  }

  root.addEventListener('change', (event) => {
    const input = event.target;
    if (input.type !== 'radio') return;
    root.querySelector(`[data-value-for="${input.name}"]`).textContent = input.dataset.label;
    setError(input.name, '');
    updateLink();
  });

  button.addEventListener('click', (event) => {
    const missing = ['color', 'size'].filter((group) => !selected(group));
    if (!missing.length) return; // all set: the link opens WhatsApp
    event.preventDefault();
    missing.forEach((group) => setError(group, t(group === 'size' ? 'product.errorSize' : 'product.errorColor')));
    root.querySelector(`input[name="${missing[0]}"]`).focus();
  });

  updateLink();
}

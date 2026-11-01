// Product page template: /product?id=<product id>
// The customer picks a color, a size and how to receive the piece (home delivery,
// pick up in store, or as a gift), then orders on WhatsApp with a ready-made message.
import { startPage, observeReveals } from '../layout.js';
import { getProduct, getProducts, getLookups } from '../data.js';
import { t, localize } from '../i18n.js';
import { productCard, icon, sizeLabel, breadcrumb, notFound, verifiedBadge, madeBadge, priceHtml } from '../components.js';
import { showFieldError, clearFieldError, clearErrorsOnInput } from '../forms.js';
import { escapeHtml, getParam, whatsappLink, storeUrl, formatPrice, findPromo } from '../utils.js';

// How the customer receives the piece. The first one is the default.
const RECEIVE_OPTIONS = ['delivery', 'pickup', 'gift'];

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
  const { cities } = await getLookups();
  document.title = `${name} — ${storeName} | Nexaro`;

  const tagLink = (filter, value, label) =>
    `<a class="pill" href="/shop?${filter}=${encodeURIComponent(value)}">${escapeHtml(localize(label))}</a>`;

  // Real products can have up to 5 photos; demo products have one drawing
  const images = product.images?.length ? product.images : [product.image];
  const hasPrice = product.price !== null && product.price !== undefined;

  root.innerHTML = `
    ${breadcrumb([
      { href: '/', label: t('nav.home') },
      { href: '/shop', label: t('nav.shop') },
      ...(product.categoryName ? [{ href: `/shop?category=${product.category}`, label: localize(product.categoryName) }] : []),
      { label: name },
    ])}
    <article class="product container">
      <div class="product__gallery reveal">
        <div class="product__media">
          <img id="product-image" src="${escapeHtml(images[0])}" alt="${escapeHtml(name)}" width="800" height="1000">
        </div>
        ${images.length > 1 ? `
          <div class="product__thumbs" role="group" aria-label="${t('product.photos')}">
            ${images.map((src, i) => `
              <button class="product__thumb" type="button" data-src="${escapeHtml(src)}" aria-pressed="${i === 0}" aria-label="${t('product.photoN', { n: i + 1 })}">
                <img src="${escapeHtml(src)}" alt="" loading="lazy">
              </button>`).join('')}
          </div>` : ''}
      </div>
      <div class="product__info">
        <p class="product__store-line">
          <a class="eyebrow product__store" href="${storeUrl(product.store)}">${escapeHtml(storeName)} · ${escapeHtml(city)}</a>
          ${verifiedBadge(product.store)}
        </p>
        <h1 class="product__name">${escapeHtml(name)}</h1>
        ${priceHtml(product, 'product__price')}
        <p class="product__price-note">${t(hasPrice ? 'product.priceConfirmNote' : 'product.priceNote')}</p>
        <div class="pill-row product__tags">
          ${madeBadge(product)}
          ${product.audienceName ? tagLink('audience', product.audience, product.audienceName) : ''}
          ${product.styleName ? tagLink('style', product.style, product.styleName) : ''}
          ${product.occasionOptions.map((occasion) => tagLink('occasion', occasion.id, occasion.name)).join('')}
        </div>
        <p class="product__desc">${escapeHtml(localize(product.description))}</p>

        <div class="order">
          ${product.colorOptions.length ? optionGroup('color', t('product.color'), product.colorOptions.map((c) => ({ value: c.id, label: localize(c.name) }))) : ''}
          ${product.sizes.length ? optionGroup('size', t('product.size'), product.sizes.map((s) => ({ value: s, label: sizeLabel(s) }))) : ''}
          ${product.sizeGuide ? `<a class="text-link order__guide" href="/size-guide#${product.sizeGuide}">${t('product.sizeGuide')}</a>` : ''}

          ${optionGroup('receive', t('product.receive'), RECEIVE_OPTIONS.map((option) => ({
            value: option,
            label: t(`product.receive${option[0].toUpperCase()}${option.slice(1)}`),
          })), RECEIVE_OPTIONS[0])}
          <p class="order__detail" id="pickup-note" hidden>${icon('store')}<span>${escapeHtml(t('product.pickupNote', { store: storeName, city }))}</span></p>
          <fieldset class="gift-fields" id="gift-fields" hidden>
            <legend class="option-group__legend">${icon('gift')}<span>${t('product.giftTitle')}</span></legend>
            <div class="form__row">
              <div class="field">
                <label class="field__label" for="gift-name">${t('product.giftName')}</label>
                <input class="field__input" id="gift-name" type="text" maxlength="60" autocomplete="off" aria-describedby="gift-name-error">
                <p class="field__error" id="gift-name-error" hidden></p>
              </div>
              <div class="field">
                <label class="field__label" for="gift-city">${t('product.giftCity')}</label>
                <input class="field__input" id="gift-city" type="text" list="gift-city-options" maxlength="40" autocomplete="off" aria-describedby="gift-city-error">
                <datalist id="gift-city-options">${cities.map((c) => `<option value="${escapeHtml(localize(c.name))}"></option>`).join('')}</datalist>
                <p class="field__error" id="gift-city-error" hidden></p>
              </div>
            </div>
            <div class="field">
              <label class="field__label" for="gift-message">${t('product.giftMessage')} <span class="field__optional">${t('form.optional')}</span></label>
              <textarea class="field__textarea field__textarea--short" id="gift-message" maxlength="150"></textarea>
            </div>
          </fieldset>

          <div class="promo" id="promo">
            <label class="field__label" for="promo-code">${t('promo.label')} <span class="field__optional">${t('form.optional')}</span></label>
            <div class="promo__row">
              <input class="field__input" id="promo-code" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false" dir="ltr" maxlength="20" aria-describedby="promo-result">
              <button class="btn btn--small" type="button" id="promo-apply">${t('promo.apply')}</button>
            </div>
            <p class="promo__result" id="promo-result" role="status"></p>
          </div>

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
        <a class="link-arrow" href="${storeUrl(product.store)}">${t('common.viewAll')}${icon('arrow')}</a>
      </div>
      <div class="product-grid" id="related-grid"></div>
    </section>`;

  initOrder(root, product, { name, storeName, city });

  // Gallery: tapping a thumbnail shows that photo
  root.querySelector('.product__thumbs')?.addEventListener('click', (event) => {
    const thumb = event.target.closest('.product__thumb');
    if (!thumb) return;
    document.getElementById('product-image').src = thumb.dataset.src;
    root.querySelectorAll('.product__thumb').forEach((b) => b.setAttribute('aria-pressed', String(b === thumb)));
  });

  const related = (await getProducts({ storeId: product.storeId })).filter((p) => p.id !== product.id).slice(0, 4);
  if (related.length) {
    document.getElementById('related-grid').innerHTML = related.map(productCard).join('');
    document.getElementById('related').hidden = false;
    observeReveals(root);
  }
});

// A group of radio buttons styled as chips. `checkedValue` is preselected;
// a group with only one option is preselected too.
function optionGroup(name, legend, options, checkedValue = options.length === 1 ? options[0].value : null) {
  const checked = options.find((option) => option.value === checkedValue);
  return `
    <fieldset class="option-group" aria-describedby="${name}-error">
      <legend class="option-group__legend">
        <span>${legend}</span><span class="option-group__value" data-value-for="${name}">${checked ? escapeHtml(checked.label) : ''}</span>
      </legend>
      <div class="chips">
        ${options.map((option) => `
          <label class="chip">
            <input type="radio" name="${name}" value="${escapeHtml(option.value)}" data-label="${escapeHtml(option.label)}"${option === checked ? ' checked' : ''}>
            <span>${escapeHtml(option.label)}</span>
          </label>`).join('')}
      </div>
      <p class="field__error" id="${name}-error" hidden></p>
    </fieldset>`;
}

function initOrder(root, product, { name, storeName, city }) {
  const button = document.getElementById('order-button');
  const giftFields = document.getElementById('gift-fields');
  const pickupNote = document.getElementById('pickup-note');
  const gift = {
    name: document.getElementById('gift-name'),
    city: document.getElementById('gift-city'),
    message: document.getElementById('gift-message'),
  };
  const selected = (group) => root.querySelector(`input[name="${group}"]:checked`);
  const isGift = () => selected('receive')?.value === 'gift';
  const hasPrice = product.price !== null && product.price !== undefined;
  let promo = null; // { code, percent } once a valid code is applied

  // Discount code (e.g. NEXARO10): checked against PROMO_CODES in config.js
  const promoInput = document.getElementById('promo-code');
  const promoResult = document.getElementById('promo-result');
  const discounted = () => Math.round(product.price * (100 - promo.percent)) / 100;
  function applyPromo() {
    const typed = promoInput.value.trim();
    promo = typed ? findPromo(typed) : null;
    promoResult.classList.toggle('is-error', Boolean(typed && !promo));
    if (!typed) promoResult.textContent = '';
    else if (!promo) promoResult.textContent = t('promo.invalid');
    else {
      promoInput.value = promo.code;
      promoResult.textContent = hasPrice
        ? t('promo.appliedWithPrice', { code: promo.code, percent: promo.percent, price: formatPrice(discounted()) })
        : t('promo.applied', { code: promo.code, percent: promo.percent });
    }
    updateLink();
  }
  document.getElementById('promo-apply').addEventListener('click', applyPromo);
  promoInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      applyPromo();
    }
  });

  function setError(group, message) {
    const error = document.getElementById(`${group}-error`);
    error.textContent = message;
    error.hidden = !message;
  }

  // Only the details for the chosen option are visible
  function showReceiveDetails() {
    const receive = selected('receive')?.value;
    pickupNote.hidden = receive !== 'pickup';
    giftFields.hidden = receive !== 'gift';
  }

  // The link always holds the latest message, so it works with a normal click or a long-press
  function updateLink() {
    let giftDetails = '';
    if (isGift()) {
      giftDetails = t('product.whatsappGift', {
        name: gift.name.value.trim() || '—',
        city: gift.city.value.trim() || '—',
      });
      const note = gift.message.value.trim();
      if (note) giftDetails += t('product.whatsappGiftMessage', { message: note });
    }
    let promoDetails = '';
    if (promo) {
      promoDetails = t('product.whatsappPromo', { code: promo.code, percent: promo.percent });
      if (hasPrice) promoDetails += t('product.whatsappPromoPrice', { price: formatPrice(discounted()) });
    }
    const message = t('product.whatsappMessage', {
      product: name,
      store: storeName,
      city,
      color: selected('color')?.dataset.label ?? '—',
      size: selected('size')?.dataset.label ?? '—',
      price: hasPrice ? t('product.whatsappPrice', { price: formatPrice(product.price) }) : '',
      method: selected('receive').dataset.label,
      promo: promoDetails,
      gift: giftDetails,
      url: `${location.origin}/product?id=${encodeURIComponent(product.id)}`,
    });
    button.href = whatsappLink(message);
  }

  root.addEventListener('change', (event) => {
    const input = event.target;
    if (input.type !== 'radio') return;
    root.querySelector(`[data-value-for="${input.name}"]`).textContent = input.dataset.label;
    setError(input.name, '');
    if (input.name === 'receive') showReceiveDetails();
    updateLink();
  });

  // Typing in the gift fields updates the message straight away
  clearErrorsOnInput(giftFields);
  giftFields.addEventListener('input', updateLink);

  button.addEventListener('click', (event) => {
    const missing = [];
    for (const group of ['color', 'size']) {
      const hasChoices = Boolean(root.querySelector(`input[name="${group}"]`)); // some products list no colors
      if (hasChoices && !selected(group)) {
        setError(group, t(group === 'size' ? 'product.errorSize' : 'product.errorColor'));
        missing.push(root.querySelector(`input[name="${group}"]`));
      }
    }
    if (isGift()) {
      for (const field of [gift.name, gift.city]) {
        if (field.value.trim()) {
          clearFieldError(field);
        } else {
          showFieldError(field, t('form.errors.required'));
          missing.push(field);
        }
      }
    }
    if (!missing.length) return; // all set: the link opens WhatsApp
    event.preventDefault();
    missing[0].focus();
  });

  updateLink();
}

// Live search in the header. Results appear while typing.
// Keyboard: ↑ ↓ move through results, Enter opens one, Esc closes. "/" or Ctrl+K opens search.
import { search } from './data.js';
import { t, tn, localize } from './i18n.js';
import { escapeHtml, debounce, storeUrl } from './utils.js';
import { icon, verifiedBadge } from './components.js';

export function initSearch() {
  const panel = document.getElementById('search-panel');
  const form = panel.querySelector('.search-form');
  const input = document.getElementById('search-input');
  const listbox = document.getElementById('search-results');
  const hint = document.getElementById('search-hint');
  const empty = document.getElementById('search-empty');
  const status = document.getElementById('search-status');
  const openButton = document.querySelector('[data-search-open]');
  const closeButton = panel.querySelector('[data-search-close]');

  let options = [];
  let activeIndex = -1;

  const isOpen = () => !panel.hidden;

  function open() {
    if (isOpen()) return input.focus();
    document.dispatchEvent(new CustomEvent('nexaro:search-open'));
    panel.hidden = false;
    openButton.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => panel.classList.add('is-open'));
    input.focus();
    input.select();
  }

  function close({ returnFocus = true } = {}) {
    if (!isOpen()) return;
    panel.classList.remove('is-open');
    panel.hidden = true;
    openButton.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-expanded', 'false');
    if (returnFocus) openButton.focus();
  }

  function setActive(index) {
    activeIndex = index;
    options.forEach((option, i) => {
      const active = i === index;
      option.classList.toggle('is-active', active);
      option.setAttribute('aria-selected', String(active));
      if (active) option.scrollIntoView({ block: 'nearest' });
    });
    if (index >= 0) input.setAttribute('aria-activedescendant', options[index].id);
    else input.removeAttribute('aria-activedescendant');
  }

  function render(results, query) {
    setActive(-1);
    const shown = results ? results.products.length + results.stores.length + results.categories.length : 0;

    hint.hidden = Boolean(query);
    empty.hidden = !query || shown > 0;
    listbox.hidden = shown === 0;
    input.setAttribute('aria-expanded', String(shown > 0));

    if (!query) {
      listbox.innerHTML = '';
      status.textContent = '';
      return;
    }
    if (!shown) {
      listbox.innerHTML = '';
      empty.textContent = t('search.empty', { q: query });
      status.textContent = empty.textContent;
      return;
    }

    let index = 0;
    const option = (href, inner, extraClass = '') =>
      `<a class="search-option ${extraClass}" role="option" id="search-option-${index++}" aria-selected="false" tabindex="-1" href="${href}">${inner}</a>`;
    const group = (key, items) => (items.length ? `
      <div class="search-group" role="group" aria-labelledby="search-group-${key}">
        <div class="search-group__title" id="search-group-${key}" role="presentation">${t(`search.${key}`)}</div>
        ${items.join('')}
      </div>` : '');

    const products = results.products.map((product) => option(
      `/product?id=${encodeURIComponent(product.id)}`,
      `<img class="search-option__thumb" src="${escapeHtml(product.image)}" alt="" width="40" height="50">
       <span><span class="search-option__title">${escapeHtml(localize(product.name))}</span>
       <span class="search-option__meta">${escapeHtml(localize(product.store.name))}${verifiedBadge(product.store, { compact: true })} · ${escapeHtml(localize(product.categoryName))}</span></span>`,
    ));
    const stores = results.stores.map((store) => option(
      storeUrl(store),
      `<span class="search-option__mono" aria-hidden="true">${escapeHtml(store.name.en.charAt(0))}</span>
       <span><span class="search-option__title">${escapeHtml(localize(store.name))}${verifiedBadge(store, { compact: true })}</span>
       <span class="search-option__meta">${escapeHtml(localize(store.cityName))}</span></span>`,
    ));
    const categories = results.categories.map((category) => option(
      `/shop?category=${encodeURIComponent(category.id)}`,
      `<span class="search-option__mono" aria-hidden="true">${icon('arrow')}</span>
       <span><span class="search-option__title">${escapeHtml(localize(category.name))}</span>
       <span class="search-option__meta">${tn('common.pieces', category.productCount)}</span></span>`,
    ));
    const seeAll = results.totalProducts
      ? option(`/shop?q=${encodeURIComponent(query)}`, `<span>${t('search.seeAll')}</span>${icon('arrow')}`, 'search-option--all')
      : '';

    listbox.innerHTML = group('products', products) + group('stores', stores) + group('categories', categories) + seeAll;
    options = [...listbox.querySelectorAll('[role="option"]')];
    status.textContent = tn('search.results', results.totalProducts + results.stores.length + results.categories.length);
  }

  const runSearch = debounce(async () => {
    const query = input.value.trim();
    if (!query) return render(null, '');
    const results = await search(query);
    if (query === input.value.trim()) render(results, query); // ignore answers to older queries
  }, 120);

  input.addEventListener('input', runSearch);

  input.addEventListener('keydown', (event) => {
    if (!options.length || listbox.hidden) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((activeIndex + 1) % options.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive(activeIndex <= 0 ? options.length - 1 : activeIndex - 1);
    }
  });

  // Enter: open the highlighted result, or go to /shop?q=... (the form's normal submit)
  form.addEventListener('submit', (event) => {
    if (activeIndex >= 0) {
      event.preventDefault();
      location.href = options[activeIndex].href;
    } else if (!input.value.trim()) {
      event.preventDefault();
    }
  });

  openButton.addEventListener('click', () => (isOpen() ? close() : open()));
  closeButton.addEventListener('click', () => close());

  document.addEventListener('keydown', (event) => {
    const typing = event.target.closest('input, textarea, select, [contenteditable="true"]');
    if (event.key === 'Escape' && isOpen()) {
      close();
    } else if ((event.key === 'k' && (event.ctrlKey || event.metaKey)) || (event.key === '/' && !typing)) {
      event.preventDefault();
      open();
    }
  });

  document.addEventListener('click', (event) => {
    if (isOpen() && !panel.contains(event.target) && !openButton.contains(event.target)) {
      close({ returnFocus: false });
    }
  });
}

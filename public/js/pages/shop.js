// Shop: all products with filters (audience, style, occasion, city, store, category, size,
// made in Palestine) and ?q= search. Filters live in the URL, so a filtered view can be
// shared or bookmarked, e.g. /shop?audience=women&occasion=eid&madeInPalestine=1
import { startPage, observeReveals } from '../layout.js';
import { getLookups, getStores, getProducts } from '../data.js';
import { t, tn, localize } from '../i18n.js';
import { productCard, emptyState, icon, sizeLabel } from '../components.js';
import { escapeHtml, getParam, setParams } from '../utils.js';

// madeInPalestine is '1' when the checkbox is ticked, '' otherwise (so it fits the URL)
const state = {
  audience: '', style: '', occasion: '', city: '', store: '', category: '', size: '', madeInPalestine: '', q: '',
};
const els = {};
let lookups = null;
let stores = [];
let requestId = 0;

startPage(async () => {
  [lookups, stores] = await Promise.all([getLookups(), getStores()]);
  Object.assign(els, {
    filters: document.getElementById('filters'),
    form: document.getElementById('filters-form'),
    toggle: document.getElementById('filters-toggle'),
    toggleLabel: document.getElementById('filters-toggle-label'),
    count: document.getElementById('results-count'),
    active: document.getElementById('active-filters'),
    grid: document.getElementById('products-grid'),
    title: document.getElementById('shop-title'),
  });

  readStateFromUrl();
  renderSelects();

  els.form.addEventListener('change', onFilterChange);
  els.form.addEventListener('submit', (event) => event.preventDefault());
  els.active.addEventListener('click', onRemoveFilter);
  els.toggle.addEventListener('click', () => {
    const open = els.filters.classList.toggle('is-open');
    els.toggle.setAttribute('aria-expanded', String(open));
  });

  await update();
});

const storeCity = (id) => stores.find((store) => store.id === id)?.city;

// Display name of a lookup value, e.g. nameOf('audiences', 'women') → "نساء"
const nameOf = (list, id) => localize(lookups[list].find((item) => item.id === id)?.name);

// Only accept values that exist, so a broken link can't break the page
function readStateFromUrl() {
  const allowed = {
    audience: lookups.audiences.map((audience) => audience.id),
    style: lookups.styles.map((style) => style.id),
    occasion: lookups.occasions.map((occasion) => occasion.id),
    city: lookups.cities.map((city) => city.id),
    store: stores.map((store) => store.id),
    category: lookups.categories.map((category) => category.id),
    size: lookups.sizeGroups.flatMap((group) => group.sizes),
    madeInPalestine: ['1'],
  };
  for (const [key, values] of Object.entries(allowed)) {
    const value = getParam(key);
    state[key] = values.includes(value) ? value : '';
  }
  state.q = getParam('q').trim();
  if (state.city && state.store && storeCity(state.store) !== state.city) state.store = '';
}

function optionsHtml(items, allLabel, selected) {
  return `<option value="">${escapeHtml(allLabel)}</option>` + items.map((item) =>
    `<option value="${escapeHtml(item.value)}"${item.value === selected ? ' selected' : ''}>${escapeHtml(item.label)}</option>`).join('');
}

function renderSelects() {
  const { elements } = els.form;
  elements.audience.innerHTML = optionsHtml(
    lookups.audiences.map((audience) => ({ value: audience.id, label: localize(audience.name) })),
    t('shop.allAudiences'), state.audience);
  elements.style.innerHTML = optionsHtml(
    lookups.styles.map((style) => ({ value: style.id, label: localize(style.name) })),
    t('shop.allStyles'), state.style);
  elements.occasion.innerHTML = optionsHtml(
    lookups.occasions.map((occasion) => ({ value: occasion.id, label: localize(occasion.name) })),
    t('shop.allOccasions'), state.occasion);
  elements.city.innerHTML = optionsHtml(
    lookups.cities.map((city) => ({ value: city.id, label: localize(city.name) })),
    t('shop.allCities'), state.city);
  renderStoreOptions();
  elements.category.innerHTML = optionsHtml(
    lookups.categories.map((category) => ({ value: category.id, label: localize(category.name) })),
    t('shop.allCategories'), state.category);
  elements.size.innerHTML = `<option value="">${escapeHtml(t('shop.allSizes'))}</option>` +
    lookups.sizeGroups.map((group) => `
      <optgroup label="${escapeHtml(localize(group.name))}">
        ${group.sizes.map((size) => `<option value="${size}"${size === state.size ? ' selected' : ''}>${escapeHtml(sizeLabel(size))}</option>`).join('')}
      </optgroup>`).join('');
  elements.madeInPalestine.checked = state.madeInPalestine === '1';
}

// The store list only shows stores in the chosen city. Verified stores get a ✓
// (a <select> can't hold the badge itself, only text).
function renderStoreOptions() {
  const available = state.city ? stores.filter((store) => store.city === state.city) : stores;
  els.form.elements.store.innerHTML = optionsHtml(
    available.map((store) => ({ value: store.id, label: `${localize(store.name)}${store.verified ? ' ✓' : ''}` })),
    t('shop.allStores'), state.store);
}

function onFilterChange(event) {
  const { name, type, checked } = event.target;
  if (!(name in state)) return;
  const value = type === 'checkbox' ? (checked ? '1' : '') : event.target.value;
  state[name] = value;
  if (name === 'city') {
    if (value && state.store && storeCity(state.store) !== value) state.store = '';
    renderStoreOptions();
  }
  update();
}

function onRemoveFilter(event) {
  const button = event.target.closest('[data-remove]');
  if (!button) return;
  const key = button.dataset.remove;
  if (key === 'all') Object.keys(state).forEach((k) => { state[k] = ''; });
  else state[key] = '';
  renderSelects();
  update();
  els.count.focus(); // the button is gone, so move focus somewhere sensible
}

async function update() {
  const id = ++requestId;
  const products = await getProducts({
    audience: state.audience,
    style: state.style,
    occasion: state.occasion,
    city: state.city,
    storeId: state.store,
    category: state.category,
    size: state.size,
    madeInPalestine: state.madeInPalestine === '1',
    q: state.q,
  });
  if (id !== requestId) return; // a newer change is already on its way

  setParams(state);

  // The heading names the main filters, e.g. "Women · Eid · Jackets"
  const titleParts = [
    state.audience && nameOf('audiences', state.audience),
    state.style && nameOf('styles', state.style),
    state.occasion && nameOf('occasions', state.occasion),
    state.category && nameOf('categories', state.category),
  ].filter(Boolean);
  els.title.textContent = titleParts.length ? titleParts.join(' · ') : t('shop.title');
  document.title = `${els.title.textContent} | Nexaro`;

  els.count.textContent = tn('common.pieces', products.length);
  els.grid.innerHTML = products.length
    ? products.map(productCard).join('')
    : emptyState(t('shop.empty'), { href: '/shop', label: t('shop.clear') });

  renderActiveFilters();
  observeReveals(els.grid);
}

function renderActiveFilters() {
  const labels = {
    q: state.q && t('shop.searchFor', { q: state.q }),
    audience: state.audience && nameOf('audiences', state.audience),
    style: state.style && nameOf('styles', state.style),
    occasion: state.occasion && nameOf('occasions', state.occasion),
    city: state.city && nameOf('cities', state.city),
    store: state.store && localize(stores.find((s) => s.id === state.store).name),
    category: state.category && nameOf('categories', state.category),
    size: state.size && sizeLabel(state.size),
    madeInPalestine: state.madeInPalestine && t('common.madeInPalestine'),
  };
  const active = Object.entries(labels).filter(([, label]) => label);

  els.active.hidden = active.length === 0;
  els.active.innerHTML = active.map(([key, label]) => `
    <button class="tag" type="button" data-remove="${key}" aria-label="${escapeHtml(t('shop.remove', { label }))}">
      <span>${escapeHtml(label)}</span>${icon('close')}
    </button>`).join('') +
    (active.length > 1 ? `<button class="text-btn" type="button" data-remove="all">${t('shop.clear')}</button>` : '');

  const filterCount = active.filter(([key]) => key !== 'q').length;
  els.toggleLabel.textContent = filterCount ? `${t('shop.filters')} (${filterCount})` : t('shop.filters');
}

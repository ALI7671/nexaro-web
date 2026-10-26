// Shop: all products with filters (city, store, category, size) and ?q= search.
// Filters live in the URL, so a filtered view can be shared or bookmarked.
import { startPage, observeReveals } from '../layout.js';
import { getLookups, getStores, getProducts } from '../data.js';
import { t, tn, localize } from '../i18n.js';
import { productCard, emptyState, icon, sizeLabel } from '../components.js';
import { escapeHtml, getParam, setParams } from '../utils.js';

const state = { city: '', store: '', category: '', size: '', q: '' };
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

// Only accept values that exist, so a broken link can't break the page
function readStateFromUrl() {
  const allowed = {
    city: lookups.cities.map((city) => city.id),
    store: stores.map((store) => store.id),
    category: lookups.categories.map((category) => category.id),
    size: lookups.sizeGroups.flatMap((group) => group.sizes),
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
}

// The store list only shows stores in the chosen city
function renderStoreOptions() {
  const available = state.city ? stores.filter((store) => store.city === state.city) : stores;
  els.form.elements.store.innerHTML = optionsHtml(
    available.map((store) => ({ value: store.id, label: localize(store.name) })),
    t('shop.allStores'), state.store);
}

function onFilterChange(event) {
  const { name, value } = event.target;
  if (!(name in state)) return;
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
    city: state.city, storeId: state.store, category: state.category, size: state.size, q: state.q,
  });
  if (id !== requestId) return; // a newer change is already on its way

  setParams(state);

  const category = lookups.categories.find((c) => c.id === state.category);
  els.title.textContent = category ? localize(category.name) : t('shop.title');
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
    city: state.city && localize(lookups.cities.find((c) => c.id === state.city).name),
    store: state.store && localize(stores.find((s) => s.id === state.store).name),
    category: state.category && localize(lookups.categories.find((c) => c.id === state.category).name),
    size: state.size && sizeLabel(state.size),
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

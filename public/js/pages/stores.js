import { startPage, observeReveals } from '../layout.js';
import { getStores, getLookups } from '../data.js';
import { t, localize } from '../i18n.js';
import { storeCard, emptyState } from '../components.js';
import { escapeHtml, getParam, setParams } from '../utils.js';

startPage(async () => {
  const [stores, lookups] = await Promise.all([getStores(), getLookups()]);
  const filter = document.getElementById('city-filter');
  const grid = document.getElementById('stores-grid');

  const cityIds = lookups.cities.map((city) => city.id);
  let city = cityIds.includes(getParam('city')) ? getParam('city') : '';

  filter.innerHTML = [{ id: '', label: t('stores.all') }]
    .concat(lookups.cities.map((c) => ({ id: c.id, label: localize(c.name) })))
    .map((c) => `<button class="pill" type="button" data-city="${c.id}" aria-pressed="false">${escapeHtml(c.label)}</button>`)
    .join('');

  function render() {
    const visible = city ? stores.filter((store) => store.city === city) : stores;
    grid.innerHTML = visible.length ? visible.map(storeCard).join('') : emptyState(t('stores.empty'));
    filter.querySelectorAll('[data-city]').forEach((button) => {
      button.setAttribute('aria-pressed', String(button.dataset.city === city));
    });
    observeReveals(grid);
  }

  filter.addEventListener('click', (event) => {
    const button = event.target.closest('[data-city]');
    if (!button) return;
    city = button.dataset.city;
    setParams({ city });
    render();
  });

  render();
});

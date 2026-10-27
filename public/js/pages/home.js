import { startPage } from '../layout.js';
import { getLookups, getProducts, getStores } from '../data.js';
import { t } from '../i18n.js';
import { productCard, storeCard, categoryTile, audienceTile, occasionTile } from '../components.js';
import { escapeHtml } from '../utils.js';

startPage(async () => {
  renderHeroTitle();

  const [lookups, featured, stores] = await Promise.all([
    getLookups(),
    getProducts({ featured: true }),
    getStores(),
  ]);

  document.getElementById('home-audiences').innerHTML = lookups.audiences.map(audienceTile).join('');
  document.getElementById('home-occasions').innerHTML = lookups.occasions.map(occasionTile).join('');
  document.getElementById('home-categories').innerHTML = lookups.categories.map(categoryTile).join('');
  document.getElementById('home-featured').innerHTML = featured.slice(0, 8).map(productCard).join('');
  document.getElementById('home-stores').innerHTML = stores.map(storeCard).join('');
});

// Each word of the tagline rises in one after another
function renderHeroTitle() {
  const title = document.getElementById('hero-title');
  const tagline = t('brand.tagline');
  const words = tagline.split(' ').map((word, i) =>
    `<span class="hero__word" style="--w:${i}" aria-hidden="true">${escapeHtml(word)}</span>`);
  title.innerHTML = `<span class="sr-only">${escapeHtml(tagline)}</span>${words.join(' ')}`;
}

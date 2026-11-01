// Data layer: the ONLY file that knows where the catalog comes from.
//
// Real stores and PUBLISHED products come from Supabase (Row Level Security only
// returns published ones to the public). The demo stores in /data/*.json are shown
// according to DEMO_CATALOG in config.js ('auto' = only until real stores exist).
// Supabase rows are turned into the same shape as the demo data, so every page
// (shop, search, filters, store, product) works the same with both.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '/config.js';
import { DEMO_CATALOG } from './config.js';
import { normalize } from './utils.js';

let catalogPromise = null;

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  return response.json();
}

// Reads public data straight from Supabase's REST API with the anon key.
// (No supabase-js download needed for shoppers.)
async function fetchSupabase(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SUPABASE_ANON_KEY } });
  if (!response.ok) throw new Error(`Supabase ${path.split('?')[0]}: ${response.status}`);
  return response.json();
}

// Real stores and published products, or null when Supabase isn't set up / reachable
async function loadRealCatalog() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  try {
    const [stores, products] = await Promise.all([
      fetchSupabase('stores?select=id,name,slug,city,description,instagram,whatsapp,logo_url,verified,created_at&order=created_at.asc'),
      fetchSupabase('products?select=*,product_images(url,position)&status=eq.published&order=created_at.desc'),
    ]);
    return { stores, products };
  } catch (error) {
    console.warn('[data] Real catalog unavailable, showing the demo catalog:', error.message);
    return null;
  }
}

// Supabase row → the demo data's shape
function fromSupabaseStore(row, cities) {
  const city = cities.find((c) => normalize(c.name.ar) === normalize(row.city) || normalize(c.name.en) === normalize(row.city));
  return {
    id: row.id,
    slug: row.slug,
    name: { ar: row.name, en: row.name },
    bio: { ar: row.description ?? '', en: row.description ?? '' },
    city: city?.id ?? null,
    customCity: city ? null : row.city, // a city that isn't in lookups.json
    logo: row.logo_url,
    verified: row.verified,
    instagram: row.instagram,
    source: 'supabase',
  };
}

function fromSupabaseProduct(row, categories) {
  const images = [...(row.product_images ?? [])].sort((a, b) => a.position - b.position).map((image) => image.url);
  const toNumber = (value) => (value === null || value === undefined ? null : Number(value));
  return {
    id: row.id,
    storeId: row.store_id,
    category: row.category,
    audience: row.section, // men / women / kids
    style: null,
    featured: false,
    occasions: row.occasions ?? [],
    madeInPalestine: row.made_in_palestine,
    name: { ar: row.name_ar || row.name_en, en: row.name_en || row.name_ar },
    description: { ar: row.description_ar || row.description_en || '', en: row.description_en || row.description_ar || '' },
    sizes: row.sizes ?? [],
    colors: row.colors ?? [],
    image: images[0] ?? categories.find((c) => c.id === row.category)?.image ?? '/images/placeholders/shirts.svg',
    images,
    price: toNumber(row.price), // null = "Price on request"
    compareAtPrice: toNumber(row.compare_at_price),
    source: 'supabase',
  };
}

// Loads everything once per page and keeps it in memory
function loadCatalog() {
  catalogPromise ??= Promise.all([
    fetchJson('/data/stores.json'),
    fetchJson('/data/products.json'),
    fetchJson('/data/lookups.json'),
    loadRealCatalog(),
  ])
    .then(([demoStores, demoProducts, lookups, real]) => {
      const realStores = (real?.stores ?? []).map((row) => fromSupabaseStore(row, lookups.cities));
      const realProducts = (real?.products ?? []).map((row) => fromSupabaseProduct(row, lookups.categories));
      const showDemo = DEMO_CATALOG === 'always' || (DEMO_CATALOG === 'auto' && realStores.length === 0);
      return buildCatalog(
        [...realStores, ...(showDemo ? demoStores : [])],
        [...realProducts, ...(showDemo ? demoProducts : [])],
        lookups,
      );
    })
    .catch((error) => {
      catalogPromise = null; // allow a retry
      throw error;
    });
  return catalogPromise;
}

// Joins the raw files together, like a database join would:
// each product gets its store, category, audience, style, occasion and color names attached.
function buildCatalog(rawStores, rawProducts, lookups) {
  const byId = (list) => Object.fromEntries(list.map((item) => [item.id, item]));
  const cities = byId(lookups.cities);
  const categories = byId(lookups.categories);
  const audiences = byId(lookups.audiences);
  const styles = byId(lookups.styles);
  const occasions = byId(lookups.occasions);
  const colors = byId(lookups.colors);

  // All names in both languages, normalized once, so search is fast
  const searchText = (...fields) =>
    normalize(fields.flatMap((field) => (field ? [field.ar, field.en] : [])).join(' '));

  const stores = rawStores.map((store) => {
    const cityName = cities[store.city]?.name ?? (store.customCity ? { ar: store.customCity, en: store.customCity } : undefined);
    return {
      ...store,
      cityName,
      productCount: rawProducts.filter((product) => product.storeId === store.id).length,
      searchText: searchText(store.name, cityName),
    };
  });
  const storesById = byId(stores);

  const products = rawProducts.filter((product) => storesById[product.storeId]).map((product) => {
    const store = storesById[product.storeId];
    const category = categories[product.category];
    const audienceName = audiences[product.audience]?.name;
    const styleName = styles[product.style]?.name;
    const occasionOptions = product.occasions.map((id) => ({ id, name: occasions[id]?.name ?? { ar: id, en: id } }));
    return {
      ...product,
      store,
      categoryName: category?.name,
      audienceName,
      styleName,
      occasionOptions,
      sizeGuide: category?.sizeGuide ?? null,
      colorOptions: product.colors.map((id) => ({ id, name: colors[id]?.name ?? { ar: id, en: id } })),
      nameText: searchText(product.name),
      searchText: searchText(product.name, category?.name, audienceName, styleName,
        ...occasionOptions.map((occasion) => occasion.name), store?.name, store?.cityName),
    };
  });

  // Real products have no "featured" flag: the home page then shows the newest 8
  if (!products.some((product) => product.featured)) products.slice(0, 8).forEach((product) => { product.featured = true; });

  // Adds how many products use each value (shown on the home page tiles).
  // Works for single values ("audience": "men") and lists ("occasions": ["eid", "work"]).
  const withCount = (list, field) => list.map((item) => ({
    ...item,
    productCount: products.filter((product) => [].concat(product[field]).includes(item.id)).length,
  }));
  const categoryList = withCount(lookups.categories, 'category').map((category) => ({
    ...category,
    searchText: searchText(category.name),
  }));

  return {
    stores,
    products,
    lookups: {
      ...lookups,
      categories: categoryList,
      audiences: withCount(lookups.audiences, 'audience'),
      styles: withCount(lookups.styles, 'style'),
      occasions: withCount(lookups.occasions, 'occasions'),
    },
  };
}

// Splits a query into words. A leading "ال" is dropped so "القميص" finds "قميص".
function searchTerms(query) {
  return normalize(query)
    .split(' ')
    .filter(Boolean)
    .map((term) => (term.length > 3 && term.startsWith('ال') ? term.slice(2) : term));
}

function matchesTerms(text, terms) {
  return terms.every((term) => text.includes(term));
}

/* ---------- Public API ---------- */

// Cities, categories, audiences, styles and occasions (with product counts), colors and size groups
export async function getLookups() {
  return (await loadCatalog()).lookups;
}

export async function getStores({ city } = {}) {
  const { stores } = await loadCatalog();
  return city ? stores.filter((store) => store.city === city) : stores;
}

export async function getStore(id) {
  const { stores } = await loadCatalog();
  return stores.find((store) => store.id === id) ?? null;
}

// For clean URLs: /store/dar-alrajul
export async function getStoreBySlug(slug) {
  const { stores } = await loadCatalog();
  return stores.find((store) => store.slug === slug) ?? null;
}

// Every filter left empty matches everything; filters that are set must all match
export async function getProducts({
  city, storeId, category, audience, style, occasion, madeInPalestine, size, featured, q,
} = {}) {
  const { products } = await loadCatalog();
  const terms = searchTerms(q);
  return products.filter((product) =>
    (!city || product.store.city === city) &&
    (!storeId || product.storeId === storeId) &&
    (!category || product.category === category) &&
    (!audience || product.audience === audience) &&
    (!style || product.style === style) &&
    (!occasion || product.occasions.includes(occasion)) &&
    (!madeInPalestine || product.madeInPalestine) &&
    (!size || product.sizes.includes(size)) &&
    (!featured || product.featured) &&
    matchesTerms(product.searchText, terms));
}

export async function getProduct(id) {
  const { products } = await loadCatalog();
  return products.find((product) => product.id === id) ?? null;
}

// Live search for the header: product names, store names and categories, in both languages
export async function search(query, { maxProducts = 6, maxStores = 3, maxCategories = 3 } = {}) {
  const terms = searchTerms(query);
  if (!terms.length) return { products: [], stores: [], categories: [], totalProducts: 0 };

  const { products, stores, lookups } = await loadCatalog();
  const productHits = products
    .filter((product) => matchesTerms(product.searchText, terms))
    // Products whose own name matches come before ones that matched by store or category
    .sort((a, b) => matchesTerms(b.nameText, terms) - matchesTerms(a.nameText, terms));

  return {
    products: productHits.slice(0, maxProducts),
    totalProducts: productHits.length,
    stores: stores.filter((store) => matchesTerms(store.searchText, terms)).slice(0, maxStores),
    categories: lookups.categories.filter((category) => matchesTerms(category.searchText, terms)).slice(0, maxCategories),
  };
}

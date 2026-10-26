// Data layer: the ONLY file that knows where the data comes from.
//
// Phase 1: static JSON files in /data.
// Phase 2: replace the inside of these functions with Supabase queries.
// Pages only call the exported functions, so they won't need to change.
import { normalize } from './utils.js';

let catalogPromise = null;

async function fetchJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`Could not load ${path} (${response.status})`);
  return response.json();
}

// Loads everything once per page and keeps it in memory
function loadCatalog() {
  catalogPromise ??= Promise.all([
    fetchJson('/data/stores.json'),
    fetchJson('/data/products.json'),
    fetchJson('/data/lookups.json'),
  ])
    .then(([stores, products, lookups]) => buildCatalog(stores, products, lookups))
    .catch((error) => {
      catalogPromise = null; // allow a retry
      throw error;
    });
  return catalogPromise;
}

// Joins the raw files together, like a database join would:
// each product gets its store, category name and color names attached.
function buildCatalog(rawStores, rawProducts, lookups) {
  const byId = (list) => Object.fromEntries(list.map((item) => [item.id, item]));
  const cities = byId(lookups.cities);
  const categories = byId(lookups.categories);
  const colors = byId(lookups.colors);

  // All names in both languages, normalized once, so search is fast
  const searchText = (...fields) =>
    normalize(fields.flatMap((field) => (field ? [field.ar, field.en] : [])).join(' '));

  const stores = rawStores.map((store) => {
    const cityName = cities[store.city]?.name;
    return {
      ...store,
      cityName,
      productCount: rawProducts.filter((product) => product.storeId === store.id).length,
      searchText: searchText(store.name, cityName),
    };
  });
  const storesById = byId(stores);

  const products = rawProducts.map((product) => {
    const store = storesById[product.storeId];
    const category = categories[product.category];
    return {
      ...product,
      store,
      categoryName: category?.name,
      sizeGuide: category?.sizeGuide ?? null,
      colorOptions: product.colors.map((id) => ({ id, name: colors[id]?.name ?? { ar: id, en: id } })),
      nameText: searchText(product.name),
      searchText: searchText(product.name, category?.name, store?.name, store?.cityName),
    };
  });

  const categoryList = lookups.categories.map((category) => ({
    ...category,
    productCount: products.filter((product) => product.category === category.id).length,
    searchText: searchText(category.name),
  }));

  return { stores, products, lookups: { ...lookups, categories: categoryList } };
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

// Cities, categories (with product counts), colors and size groups
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

export async function getProducts({ city, storeId, category, size, featured, q } = {}) {
  const { products } = await loadCatalog();
  const terms = searchTerms(q);
  return products.filter((product) =>
    (!city || product.store.city === city) &&
    (!storeId || product.storeId === storeId) &&
    (!category || product.category === category) &&
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

// "Join as a store" form
export async function submitStoreApplication(application) {
  // Phase 2: insert `application` into a Supabase table, e.g. store_applications
  await new Promise((resolve) => setTimeout(resolve, 600));
  console.info('[Nexaro] Store application (not saved until Phase 2):', application);
  return { ok: true };
}

// Translations: loads /i18n/{lang}.json, translates the page and remembers the choice.
//
// In HTML:  <p data-i18n="home.heroText"></p>                → sets the text
//           <input data-i18n-attr="placeholder:search.placeholder"> → sets attributes
// In JS:    t('search.empty', { q: 'shirt' })                  → "No results for “shirt”"
import { DEFAULT_LANG, LANGS, STORAGE_KEYS } from './config.js';

let currentLang = DEFAULT_LANG;
let strings = {};

export function getLang() {
  return currentLang;
}

// A ?lang=en link wins (handy for campaigns), then the saved choice, then Arabic
function readLang() {
  const fromUrl = new URLSearchParams(location.search).get('lang');
  if (LANGS.includes(fromUrl)) {
    saveLang(fromUrl);
    return fromUrl;
  }
  try {
    const saved = localStorage.getItem(STORAGE_KEYS.lang);
    if (LANGS.includes(saved)) return saved;
  } catch {
    // Storage can be blocked (private mode); fall back to the default
  }
  return DEFAULT_LANG;
}

function saveLang(lang) {
  try {
    localStorage.setItem(STORAGE_KEYS.lang, lang);
  } catch {
    // Not fatal: the choice just won't be remembered
  }
}

export async function initI18n() {
  currentLang = readLang();
  document.documentElement.lang = currentLang;
  document.documentElement.dir = currentLang === 'ar' ? 'rtl' : 'ltr';

  const response = await fetch(`/i18n/${currentLang}.json`);
  if (!response.ok) throw new Error(`Could not load /i18n/${currentLang}.json`);
  strings = await response.json();
}

// Saves the new language and reloads, so every part of the page is rebuilt in it
export function setLang(lang) {
  if (!LANGS.includes(lang) || lang === currentLang) return;
  saveLang(lang);
  const url = new URL(location.href);
  url.searchParams.delete('lang');
  location.href = url.toString();
}

function lookup(key) {
  return key.split('.').reduce((node, part) => node?.[part], strings);
}

export function t(key, vars = {}) {
  const value = lookup(key);
  if (typeof value !== 'string') {
    console.warn(`[i18n] Missing key "${key}" in ${currentLang}.json`);
    return key;
  }
  return value.replace(/\{(\w+)\}/g, (match, name) => (name in vars ? vars[name] : match));
}

// Plurals: the JSON holds forms like { "one": "...", "few": "...", "other": "{n} ..." }.
// Intl.PluralRules picks the right one (Arabic has six forms, English two).
export function tn(key, count, vars = {}) {
  const forms = lookup(key) ?? {};
  const rule = new Intl.PluralRules(currentLang).select(count);
  const form = rule in forms ? rule : 'other';
  return t(`${key}.${form}`, { n: count, ...vars });
}

// Picks the current language from a { ar, en } data field
export function localize(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  return value[currentLang] ?? value[DEFAULT_LANG] ?? '';
}

export function translateDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    el.dataset.i18nAttr.split(',').forEach((pair) => {
      const [attr, key] = pair.split(':').map((part) => part.trim());
      el.setAttribute(attr, t(key));
    });
  });
}

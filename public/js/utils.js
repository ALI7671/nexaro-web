// Small helpers shared by every page.
import { WHATSAPP_NUMBER } from './config.js';

// Always escape data before putting it into innerHTML
export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Makes text easy to compare in search, in both languages:
// lowercase, no accents or Arabic diacritics, and أ/إ/آ → ا, ة → ه, ى → ي
export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')            // Latin accents
    .replace(/[ً-ٰٟـ]/g, '') // Arabic diacritics, hamza marks, tatweel
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[-_'’]/g, '')                      // "T-shirt" matches "tshirt"
    .replace(/\s+/g, ' ')
    .trim();
}

export function debounce(fn, wait) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}

export function getParam(name) {
  return new URLSearchParams(location.search).get(name) ?? '';
}

// Updates the query string without reloading. Empty values are removed;
// other parameters (like utm_* or lang) are kept.
export function setParams(values) {
  const params = new URLSearchParams(location.search);
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
    else params.delete(key);
  }
  const query = params.toString();
  history.replaceState(null, '', query ? `?${query}` : location.pathname);
}

export function whatsappLink(message) {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

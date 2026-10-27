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

// No phone number: WhatsApp asks the user which chat to share with
export function whatsappShareLink(message) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

// The one place store links are built: /store/dar-alrajul
export function storeUrl(store) {
  return `/store/${encodeURIComponent(store.slug)}`;
}

// Copies text to the clipboard. Returns true if it worked.
export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, or the page isn't on https: fall back to a hidden text box
    const box = document.createElement('textarea');
    box.value = text;
    box.setAttribute('readonly', '');
    box.style.cssText = 'position:fixed;top:0;opacity:0';
    document.body.append(box);
    box.select();
    const copied = document.execCommand('copy');
    box.remove();
    return copied;
  }
}

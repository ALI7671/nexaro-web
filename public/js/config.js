// Site-wide settings. Change values here, not inside the page scripts.

// Placeholder WhatsApp number: country code, no "+" and no leading zero
export const WHATSAPP_NUMBER = '970599000000';

export const CONTACT = {
  whatsappDisplay: '+970 599 000 000',
  email: 'hello@nexaro.ps',
  instagram: 'nexaro.ps',
};

export const LANGS = ['ar', 'en'];
export const DEFAULT_LANG = 'ar';

// Keys used in localStorage (the inline script in each page's <head> reads the same keys)
export const STORAGE_KEYS = {
  lang: 'nexaro.lang',
  theme: 'nexaro.theme',
};

// The demo stores and products in /data/*.json:
//   'auto'   show them only while there are no real (Supabase) stores yet
//   'always' show them next to the real stores
//   'never'  never show them
export const DEMO_CATALOG = 'auto';

// Prices are in shekels
export const CURRENCY = 'ILS';

// Discount codes a customer can type on the product page. The code (and the discounted
// price, when the product has a price) is written into the WhatsApp order message,
// and the store applies it when confirming the order.
export const PROMO_CODES = {
  NEXARO10: { percent: 10 },
};

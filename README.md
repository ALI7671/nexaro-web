# Nexaro — Wear Your Next

A marketplace that brings the best Palestinian men's clothing stores into one place and delivers to your door. Based in Ramallah. (University marketing project.)

## Run

```
npm install
npm start      # http://localhost:3000
npm run dev    # same, restarts when server.js changes
```

Open the pages through the server (not by double-clicking the HTML files), because the scripts load JSON with `fetch`.

## Structure

```
server.js                 Express: serves public/, clean URLs (/shop → shop.html), 404 page
public/
  *.html                  One file per page. Store and product pages are templates:
                          /store?id=aseel   /product?id=aseel-02
  css/style.css           All styles. Brand colors and fonts are at the top (section 1)
  js/config.js            WhatsApp number, contact details, languages
  js/data.js              ★ The only file that loads data (JSON now, Supabase in Phase 2)
  js/i18n.js              Translations: t('key'), plurals, language switch
  js/layout.js            Header, footer, mobile menu, scroll reveal; startPage()
  js/search.js            Live search in the header
  js/components.js        Product / store / category cards, icons, breadcrumbs
  js/forms.js             Form validation helpers
  js/utils.js             escapeHtml, search normalization, URL params, WhatsApp links
  js/pages/*.js           One small script per page
  i18n/ar.json, en.json   ALL interface text, in Arabic and English
  data/stores.json        6 stores
  data/products.json      36 products (6 per store)
  data/lookups.json       Cities, categories, colors and size groups (names in both languages)
  images/logo.png         Your logo (add it; a text "NEXARO" shows until it exists)
  images/placeholders/    Monochrome product placeholders, one per category
```

## How the pieces fit

- **Every page** has empty `<header id="site-header">` and `<footer id="site-footer">` tags that `layout.js` fills, so the header and footer are written once.
- **Text** never lives in the HTML. Elements carry `data-i18n="section.key"` and get their text from `i18n/ar.json` or `i18n/en.json`. To change any wording, edit the JSON files and keep both files' keys the same.
- **Language**: Arabic (RTL) is the default. The choice is saved in `localStorage` (`nexaro.lang`). A link with `?lang=en` or `?lang=ar` also switches the language, which is handy for campaigns.
- **Data**: pages call functions in `data.js` (`getStores`, `getProducts({ city, category, size })`, `search(q)`…) and never fetch files directly. In Phase 2 only the inside of those functions changes.
- **Prices**: there are none. Every product shows "السعر عند الطلب / Price on request".
- **WhatsApp ordering**: the product page builds the message from `product.whatsappMessage` in the i18n files. The number is `WHATSAPP_NUMBER` in `js/config.js`.

## Editing content

**Store** (`data/stores.json`)
```json
{ "id": "aseel", "name": { "ar": "أصيل", "en": "Aseel" }, "bio": { "ar": "…", "en": "…" }, "city": "hebron", "logo": null }
```
`city` must be an id from `lookups.json`. Set `logo` to an image path to replace the letter monogram.

**Product** (`data/products.json`)
```json
{ "id": "aseel-02", "storeId": "aseel", "category": "shoes", "featured": true,
  "name": { "ar": "…", "en": "…" }, "description": { "ar": "…", "en": "…" },
  "sizes": ["40", "41"], "colors": ["brown", "black"], "image": "/images/placeholders/shoes.svg" }
```
`category`, `colors` and `sizes` must match ids in `lookups.json`. `featured: true` puts a product on the home page. Product images look best at a 4:5 portrait ratio.

## Placeholders to replace before launch

- WhatsApp number `970599000000` and the display number `+970 599 000 000` (`js/config.js`)
- Email `hello@nexaro.ps` and Instagram `nexaro.ps` (`js/config.js`)
- Opening hours (`contact.hoursValue` in both i18n files)
- `public/images/logo.png`

## Roadmap

1. **Phase 1 (done):** pages, bilingual, fictional data, live search, filters, size guide, WhatsApp ordering, join form
2. **Phase 2:** Supabase auth (the header has an empty `#auth-slot` ready), wishlist, reviews with approval, newsletter, saving store applications (`submitStoreApplication` in `data.js`)
3. **Phase 3:** admin dashboard, discount codes, GA4 + Meta Pixel, UTM tracking
4. **Phase 4:** SEO, deploy to Render, custom domain

# Nexaro — Wear Your Next

Online marketplace connecting Palestinian men's clothing stores with customers (university marketing project).

## Run

```
npm install
npm start      # http://localhost:3000
npm run dev    # same, restarts on server changes
```

## Structure

- `server.js` — Express, serves `public/`
- `public/index.html`, `stores.html`, `store.html?id=1`, `about.html`
- `public/css/style.css` — brand colors and fonts in `:root`
- `public/js/common.js` — shared helpers; WhatsApp number is `WHATSAPP_NUMBER` at the top
- `public/data/stores.json`, `public/data/products.json` — all content

## Editing content

- **Store:** `id, name, nameEn, city, description, logo, featured`
- **Product:** `id, storeId, name, price (₪, number), sizes [], image, featured`
- Put images in `public/images/` and reference them as `/images/your-file.jpg` (4:5 portrait works best).
- `featured: true` shows the store/product on the home page.

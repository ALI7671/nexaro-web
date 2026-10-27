const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const isProduction = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');

// The join form moved to the For Stores page; keep old links working
app.get(['/join', '/join.html'], (req, res) => res.redirect(301, '/for-stores'));

// Read on every request (it's tiny), so editing stores.json needs no restart.
// Phase 2: this becomes a Supabase query.
const readStores = () => JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'data', 'stores.json'), 'utf8'));
const sendNotFound = (res) => res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));

// Clean store links: /store/dar-alrajul serves the store page template.
// An unknown slug gets a real 404, which matters for search engines later.
app.get('/store/:slug', (req, res) => {
  if (!readStores().some((store) => store.slug === req.params.slug)) return sendNotFound(res);
  res.sendFile(path.join(PUBLIC_DIR, 'store.html'));
});

// Old links (/store?id=aseel) move permanently to the clean URL
app.get(['/store', '/store.html'], (req, res, next) => {
  const store = readStores().find((s) => s.id === req.query.id);
  if (store) return res.redirect(301, `/store/${store.slug}`);
  next();
});

// Serve everything in public/. `extensions` gives clean URLs: /stores → stores.html
app.use(express.static(PUBLIC_DIR, {
  extensions: ['html'],
  maxAge: isProduction ? '1d' : 0,
}));

// Anything not found above gets the 404 page
app.use((req, res) => sendNotFound(res));

app.listen(PORT, () => {
  console.log(`Nexaro running at http://localhost:${PORT}`);
});

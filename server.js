const express = require('express');
const fs = require('fs');
const path = require('path');

// Local development reads secrets from .env (never committed). On Render there is
// no .env file: the same variables are set in the dashboard instead.
if (fs.existsSync(path.join(__dirname, '.env'))) process.loadEnvFile(path.join(__dirname, '.env'));

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const isProduction = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');

// Supabase settings for the browser. ONLY the project URL and the public anon key,
// which are designed to be public (Row Level Security protects the data).
// Never add the service_role key or anything else from process.env here.
app.get('/config.js', (req, res) => {
  const config = {
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
  };
  res.type('application/javascript').set('Cache-Control', 'no-store');
  res.send(Object.entries(config)
    .map(([name, value]) => `export const ${name} = ${JSON.stringify(value)};`)
    .join('\n'));
});

// /admin on its own goes to the store applications
app.get(['/admin', '/admin/'], (req, res) => res.redirect('/admin/applications'));

// The join form moved to the For Stores page; keep old links working
app.get(['/join', '/join.html'], (req, res) => res.redirect(301, '/for-stores'));

// Read on every request (it's tiny), so editing stores.json needs no restart.
const readStores = () => JSON.parse(fs.readFileSync(path.join(PUBLIC_DIR, 'data', 'stores.json'), 'utf8'));
const sendNotFound = (res) => res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));

// Is there a real (Supabase) store with this slug? Uses the public anon key, like the
// browser does. Answers are remembered for a minute. null = couldn't check.
const slugCache = new Map();
async function realStoreExists(slug) {
  const { SUPABASE_URL: url, SUPABASE_ANON_KEY: key } = process.env;
  if (!url || !key) return false;
  const cached = slugCache.get(slug);
  if (cached && cached.time > Date.now() - 60_000) return cached.exists;
  try {
    const response = await fetch(`${url}/rest/v1/stores?select=id&slug=eq.${encodeURIComponent(slug)}`, {
      headers: { apikey: key },
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) return null;
    const exists = (await response.json()).length > 0;
    slugCache.set(slug, { exists, time: Date.now() });
    return exists;
  } catch {
    return null;
  }
}

// The store owner's dashboard (must come before /store/:slug)
app.get(['/store/dashboard', '/store/dashboard/'], (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'store-dashboard.html'));
});

// Clean store links: /store/dar-alrajul serves the store page template.
// An unknown slug gets a real 404, which matters for search engines.
// If Supabase can't be reached, the page is served and shows its own "not found".
app.get('/store/:slug', async (req, res) => {
  const { slug } = req.params;
  const known = readStores().some((store) => store.slug === slug) || (await realStoreExists(slug)) !== false;
  if (!known) return sendNotFound(res);
  res.sendFile(path.join(PUBLIC_DIR, 'store.html'));
});

// The service worker must never be cached, or updates to it wouldn't reach people
app.get('/sw.js', (req, res) => {
  res.set('Cache-Control', 'no-cache');
  res.sendFile(path.join(PUBLIC_DIR, 'sw.js'));
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

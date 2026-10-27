const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const isProduction = process.env.NODE_ENV === 'production';

app.disable('x-powered-by');

// The join form moved to the For Stores page; keep old links working
app.get(['/join', '/join.html'], (req, res) => res.redirect(301, '/for-stores'));

// Serve everything in public/. `extensions` gives clean URLs: /stores → stores.html
app.use(express.static(PUBLIC_DIR, {
  extensions: ['html'],
  maxAge: isProduction ? '1d' : 0,
}));

// Anything not found above gets the 404 page
app.use((req, res) => {
  res.status(404).sendFile(path.join(PUBLIC_DIR, '404.html'));
});

app.listen(PORT, () => {
  console.log(`Nexaro running at http://localhost:${PORT}`);
});

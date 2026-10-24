// Shared helpers for all pages: data loading, WhatsApp links, cards, header and footer.

// Placeholder number — replace with the real one (country code, no "+" or leading zero)
const WHATSAPP_NUMBER = '970599000000';

async function loadData() {
  const [stores, products] = await Promise.all([
    fetch('/data/stores.json').then(r => r.json()),
    fetch('/data/products.json').then(r => r.json())
  ]);
  return { stores, products };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(price) {
  return `₪${price}`;
}

function whatsappLink(product, store) {
  const message = `مرحباً، أود طلب هذا المنتج من Nexaro:\n` +
    `المنتج: ${product.name}\n` +
    `المتجر: ${store.name}\n` +
    `السعر: ${formatPrice(product.price)}`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function storeCard(store) {
  return `
    <a class="store-card" href="/store.html?id=${store.id}">
      <div class="media"><img src="${escapeHtml(store.logo)}" alt="${escapeHtml(store.name)}" loading="lazy"></div>
      <div class="meta">
        <div class="name-en en">${escapeHtml(store.nameEn)}</div>
        <h3>${escapeHtml(store.name)}</h3>
        <div class="city">${escapeHtml(store.city)}</div>
        <p class="desc">${escapeHtml(store.description)}</p>
      </div>
    </a>`;
}

function productCard(product, store) {
  const sizes = product.sizes.map(size => `<li>${escapeHtml(size)}</li>`).join('');
  return `
    <article class="product-card">
      <div class="media"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" loading="lazy"></div>
      <div class="info">
        <a class="store-name" href="/store.html?id=${store.id}">${escapeHtml(store.name)}</a>
        <h3>${escapeHtml(product.name)}</h3>
        <div class="price">${formatPrice(product.price)}</div>
        <ul class="sizes" aria-label="المقاسات">${sizes}</ul>
        <a class="btn btn-block" href="${whatsappLink(product, store)}" target="_blank" rel="noopener">اطلب عبر واتساب</a>
      </div>
    </article>`;
}

function renderHeader() {
  const links = [
    { href: '/', label: 'الرئيسية' },
    { href: '/stores.html', label: 'المتاجر' },
    { href: '/about.html', label: 'عن نيكسارو' }
  ];
  const path = location.pathname === '/index.html' ? '/' : location.pathname;
  const isActive = href => href === path || (href === '/stores.html' && path === '/store.html');

  document.getElementById('site-header').innerHTML = `
    <div class="container">
      <a class="logo" href="/">NEXARO</a>
      <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="nav">MENU</button>
      <nav class="nav" id="nav">
        ${links.map(l => `<a href="${l.href}"${isActive(l.href) ? ' class="active"' : ''}>${l.label}</a>`).join('')}
      </nav>
    </div>`;

  const toggle = document.querySelector('.nav-toggle');
  const nav = document.getElementById('nav');
  toggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    toggle.setAttribute('aria-expanded', open);
    toggle.textContent = open ? 'CLOSE' : 'MENU';
  });
}

function renderFooter() {
  document.getElementById('site-footer').innerHTML = `
    <div class="container">
      <a class="logo" href="/">NEXARO</a>
      <span class="tagline en">Wear Your Next</span>
      <small>© ${new Date().getFullYear()} Nexaro — سوق متاجر الملابس الرجالية الفلسطينية</small>
    </div>`;
}

renderHeader();
renderFooter();

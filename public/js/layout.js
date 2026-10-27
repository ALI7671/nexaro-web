// Shared page frame: header, footer, mobile menu, language switch and scroll reveals.
// Every page script starts with: startPage(async () => { ...page code... })
import { CONTACT } from './config.js';
import { initI18n, t, translateDom, getLang, setLang } from './i18n.js';
import { initSearch } from './search.js';
import { icon } from './components.js';
import { whatsappLink } from './utils.js';

// `page` matches <body data-nav="..."> so the current link is marked
const NAV_LINKS = [
  { page: 'home', href: '/', key: 'nav.home' },
  { page: 'shop', href: '/shop', key: 'nav.shop' },
  { page: 'stores', href: '/stores', key: 'nav.stores' },
  { page: 'for-stores', href: '/for-stores', key: 'nav.forStores' },
  { page: 'how', href: '/how-it-works', key: 'nav.howItWorks' },
  { page: 'about', href: '/about', key: 'nav.about' },
  { page: 'contact', href: '/contact', key: 'nav.contact' },
];

export async function startPage(init) {
  try {
    await initI18n();
    renderHeader();
    renderFooter();
    translateDom();
    renderIcons();
    initLogos();
    initMenu();
    initSearch();
    if (init) await init();
  } catch (error) {
    console.error(error);
    showPageError();
  } finally {
    document.documentElement.classList.add('is-ready');
    observeReveals();
  }
}

function logo() {
  return `
    <a class="logo" href="/" aria-label="${t('a11y.home')}">
      <img class="logo__img" src="/images/logo.png" alt="">
      <span class="logo__text" aria-hidden="true">NEXARO</span>
    </a>`;
}

function renderHeader() {
  const header = document.getElementById('site-header');
  const current = document.body.dataset.nav;
  const otherLang = getLang() === 'ar' ? 'en' : 'ar';

  const links = NAV_LINKS.map((link) => `
    <li class="${link.page === 'home' ? 'nav-list__home' : ''}">
      <a href="${link.href}"${link.page === current ? ' aria-current="page"' : ''}>${t(link.key)}</a>
    </li>`).join('');

  header.innerHTML = `
    <div class="container header__bar">
      <button class="icon-btn header__menu-btn" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="${t('a11y.openMenu')}">${icon('menu')}</button>
      ${logo()}
      <nav class="header__nav" id="site-nav" aria-label="${t('a11y.mainNav')}">
        <ul class="nav-list">${links}</ul>
        <a class="link-arrow nav-extra" href="/for-stores#apply">${t('nav.join')}${icon('arrow')}</a>
      </nav>
      <div class="header__actions">
        <button class="icon-btn" type="button" data-search-open aria-expanded="false" aria-controls="search-panel" aria-label="${t('a11y.openSearch')}">${icon('search')}</button>
        <button class="lang-btn" type="button" data-lang="${otherLang}" lang="${otherLang}" aria-label="${t('a11y.switchLang')}">${t('lang.switch')}</button>
        <!-- Phase 2: the Sign in / Sign up button is rendered into this slot -->
        <div class="auth-slot" id="auth-slot" hidden></div>
      </div>
    </div>

    <div class="search-panel" id="search-panel" hidden>
      <div class="container search-panel__inner">
        <form class="search-form" role="search" action="/shop" method="get">
          <label class="sr-only" for="search-input">${t('search.label')}</label>
          ${icon('search')}
          <input class="search-input" id="search-input" name="q" type="search" autocomplete="off" spellcheck="false"
            placeholder="${t('search.placeholder')}" role="combobox" aria-autocomplete="list"
            aria-expanded="false" aria-controls="search-results" aria-describedby="search-hint">
          <button class="icon-btn" type="button" data-search-close aria-label="${t('a11y.closeSearch')}">${icon('close')}</button>
        </form>
        <p class="search-hint" id="search-hint">${t('search.hint')}</p>
        <div class="search-results" id="search-results" role="listbox" aria-label="${t('search.label')}" hidden></div>
        <p class="search-empty" id="search-empty" hidden></p>
        <p class="sr-only" id="search-status" role="status"></p>
      </div>
    </div>`;

  header.querySelector('.lang-btn').addEventListener('click', (event) => {
    setLang(event.currentTarget.dataset.lang);
  });
}

function renderFooter() {
  const footer = document.getElementById('site-footer');
  const link = (href, key) => `<li><a href="${href}">${t(key)}</a></li>`;

  footer.innerHTML = `
    <div class="container">
      <div class="footer__grid">
        <div class="footer__brand">
          ${logo()}
          <p class="footer__tagline">${t('brand.tagline')}</p>
          <p class="footer__about">${t('footer.about')}</p>
        </div>
        <nav aria-label="${t('footer.shop')}">
          <h2 class="footer__title">${t('footer.shop')}</h2>
          <ul class="footer__links">
            ${link('/shop', 'footer.allPieces')}
            ${link('/stores', 'nav.stores')}
            ${link('/size-guide', 'nav.sizeGuide')}
          </ul>
        </nav>
        <nav aria-label="${t('footer.company')}">
          <h2 class="footer__title">${t('footer.company')}</h2>
          <ul class="footer__links">
            ${link('/about', 'nav.about')}
            ${link('/how-it-works', 'nav.howItWorks')}
            ${link('/for-stores', 'nav.forStores')}
          </ul>
        </nav>
        <nav aria-label="${t('footer.policies')}">
          <h2 class="footer__title">${t('footer.policies')}</h2>
          <ul class="footer__links">
            ${link('/policies#exchange', 'footer.exchange')}
            ${link('/policies#payment', 'footer.payment')}
            ${link('/policies#delivery', 'footer.delivery')}
            ${link('/terms', 'footer.terms')}
            ${link('/privacy', 'footer.privacy')}
          </ul>
        </nav>
        <div>
          <h2 class="footer__title">${t('footer.contact')}</h2>
          <ul class="footer__links">
            <li><a href="${whatsappLink(t('contact.whatsappHello'))}" target="_blank" rel="noopener"><span dir="ltr">${CONTACT.whatsappDisplay}</span></a></li>
            <li><a href="https://www.instagram.com/${CONTACT.instagram}" target="_blank" rel="noopener"><span dir="ltr">@${CONTACT.instagram}</span></a></li>
            ${link('/contact', 'nav.contact')}
            <li class="muted">${t('footer.location')}</li>
          </ul>
        </div>
      </div>
      <div class="footer__bottom">
        <p>${t('footer.rights', { year: new Date().getFullYear() })}</p>
        <p class="latin">${t('brand.tagline')}</p>
      </div>
    </div>`;
}

// <span data-icon="arrow"></span> in static HTML becomes an inline SVG icon
export function renderIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.outerHTML = icon(el.dataset.icon);
  });
}

// Shows logo.png once it loads; until then (or if it's missing) the text wordmark shows
function initLogos() {
  document.querySelectorAll('.logo__img').forEach((img) => {
    const show = () => img.closest('.logo').classList.add('has-image');
    if (img.complete && img.naturalWidth) show();
    else img.addEventListener('load', show, { once: true });
  });
}

function initMenu() {
  const header = document.getElementById('site-header');
  const button = header.querySelector('.header__menu-btn');
  const nav = header.querySelector('.header__nav');
  const isOpen = () => header.classList.contains('is-menu-open');

  function setOpen(open) {
    header.classList.toggle('is-menu-open', open);
    document.body.classList.toggle('no-scroll', open);
    button.setAttribute('aria-expanded', String(open));
    button.setAttribute('aria-label', t(open ? 'a11y.closeMenu' : 'a11y.openMenu'));
    button.innerHTML = icon(open ? 'close' : 'menu');
    // Keep keyboard focus inside the open menu
    document.getElementById('main').inert = open;
    document.getElementById('site-footer').inert = open;
  }

  button.addEventListener('click', () => setOpen(!isOpen()));
  nav.addEventListener('click', (event) => {
    if (event.target.closest('a')) setOpen(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isOpen()) {
      setOpen(false);
      button.focus();
    }
  });
  document.addEventListener('nexaro:search-open', () => {
    if (isOpen()) setOpen(false);
  });
  window.matchMedia('(min-width: 1200px)').addEventListener('change', (event) => {
    if (event.matches && isOpen()) setOpen(false);
  });
}

function showPageError() {
  const main = document.getElementById('main');
  if (!main) return;
  main.innerHTML = `
    <section class="page-message container">
      <p>تعذّر تحميل الصفحة. حدّث الصفحة وحاول مرة أخرى.</p>
      <p class="latin" lang="en">We couldn't load this page. Please refresh and try again.</p>
    </section>`;
}

/* ---------- Scroll reveal (subtle fade-up) ---------- */

const revealObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { rootMargin: '0px 0px -6% 0px' })
  : null;

// Call again after adding new .reveal elements (e.g. after filtering)
export function observeReveals(root = document) {
  root.querySelectorAll('.reveal:not(.is-visible)').forEach((el) => {
    if (revealObserver) revealObserver.observe(el);
    else el.classList.add('is-visible');
  });
}

// /store/dashboard: a store owner edits their store details and manages their products.
//
// Row Level Security (supabase/phase4.sql) is the real protection: an owner can only
// read and change their OWN store's products, images and files, and can only save a
// product as 'draft' or 'pending' (an admin publishes it). This page just offers the tools.
//
// Views (the part after # in the address, so the phone's back button works):
//   #products   the list          #new        add a product
//   #edit/<id>  edit a product    #store      store details
import { startPage } from '../layout.js';
import { t, localize } from '../i18n.js';
import { getLookups } from '../data.js';
import { getSupabase, requireUser, errorKey } from '../auth.js';
import { icon, sizeLabel, verifiedBadge, priceHtml } from '../components.js';
import {
  validateForm, showFieldError, clearFieldError, clearErrorsOnInput, setBusy, showMessage,
  phone as phoneRule, instagram as instagramRule,
} from '../forms.js';
import { escapeHtml, normalize, storeUrl, formatDate } from '../utils.js';
import { compressImage, extensionFor } from '../image-tools.js';

const BUCKET = 'product-images';
const MAX_IMAGES = 5;
const STATUSES = ['draft', 'pending', 'published', 'rejected'];
const SECTIONS = ['men', 'women', 'kids'];
const capitalize = (word) => word[0].toUpperCase() + word.slice(1);
const statusLabel = (status) => t(`dash.status${capitalize(status)}`);
// crypto.randomUUID needs https/localhost; the fallback keeps file names unique anyway
const uniqueId = () => crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
// The storage path inside the bucket, from a file's public address
const pathFromUrl = (url) => decodeURIComponent(url.split(`/object/public/${BUCKET}/`)[1] ?? '');

let supabase;
let lookups;
let store;
let products = [];
let filter = 'all';
let query = '';
let editing = null; // the product open in the form (null = a new one)
let images = []; // the form's photos, in order: { id?, url?, blob?, preview, position? }
let removedImages = []; // saved photos the owner removed (deleted when they save)
let newLogo = null; // a chosen but not yet saved logo

const $ = (id) => document.getElementById(id);
const productForm = () => $('product-form');

startPage(async () => {
  const { user } = await requireUser({ role: 'store' });
  supabase = await getSupabase();
  lookups = await getLookups();

  const { data, error } = await supabase.from('stores').select('*').eq('owner_id', user.id).maybeSingle();
  if (error || !data) {
    // Approved, but phase4.sql wasn't run yet (or the store was removed)
    document.querySelector('.dash-tabs').hidden = true;
    showMessage($('dash-message'), t(error ? errorKey(error) : 'dash.noStore'));
    return;
  }
  store = data;

  renderStoreHead();
  buildProductOptions();
  wireProductList();
  wireProductForm();
  wireStoreForm();
  await loadProducts();

  window.addEventListener('hashchange', route);
  route();
});

/* ---------- Views ---------- */

function route() {
  const [view, id] = (location.hash.slice(1) || 'products').split('/');
  const views = { products: 'view-products', new: 'product-form', edit: 'product-form', store: 'store-form' };
  const active = views[view] ? view : 'products';
  Object.values(views).forEach((elementId) => { $(elementId).hidden = true; });
  $(views[active]).hidden = false;
  document.querySelectorAll('.dash-tab').forEach((tab) => {
    const current = tab.dataset.tab === (active === 'store' ? 'store' : 'products');
    tab.setAttribute('aria-current', current ? 'page' : 'false');
  });

  if (active === 'new') openProductForm(null);
  else if (active === 'edit') {
    const product = products.find((p) => p.id === id);
    if (!product) {
      // not this store's product (or deleted): RLS wouldn't return it anyway
      showMessage($('dash-message'), t('dash.productNotFound'));
      location.hash = '#products';
      return;
    }
    openProductForm(product);
  } else if (active === 'store') openStoreForm();
  else renderProductList();
  if (active !== 'products') showMessage($('dash-message'), '');
  window.scrollTo({ top: 0 });
}

function renderStoreHead() {
  $('dash-store-name').textContent = store.name;
  $('dash-verified').innerHTML = verifiedBadge(store);
  $('dash-store-link').href = storeUrl(store);
  document.title = `${t('dash.title')} · ${store.name} | Nexaro`;
}

/* ---------- My products ---------- */

async function loadProducts() {
  const { data, error } = await supabase
    .from('products')
    .select('*, product_images(id, url, position)')
    .eq('store_id', store.id)
    .order('updated_at', { ascending: false });
  if (error) {
    showMessage($('dash-message'), t(errorKey(error)));
    return;
  }
  products = data.map((p) => ({ ...p, product_images: [...(p.product_images ?? [])].sort((a, b) => a.position - b.position) }));
}

const productName = (p) => localize({ ar: p.name_ar || p.name_en, en: p.name_en || p.name_ar });

function renderProductList() {
  const count = (status) => products.filter((p) => status === 'all' || p.status === status).length;
  $('status-filter').innerHTML = ['all', ...STATUSES].map((status) => `
    <button class="pill" type="button" data-status="${status}" aria-pressed="${status === filter}">
      ${status === 'all' ? t('admin.all') : statusLabel(status)} (${count(status)})
    </button>`).join('');

  const terms = normalize(query);
  const visible = products
    .filter((p) => filter === 'all' || p.status === filter)
    .filter((p) => !terms || normalize(`${p.name_ar ?? ''} ${p.name_en ?? ''}`).includes(terms));

  $('product-list').innerHTML = visible.length ? visible.map(productItem).join('') : `
    <li class="empty-state">
      <p>${products.length ? t('dash.noMatches') : t('dash.empty')}</p>
      ${products.length ? '' : `<a class="btn" href="#new">${t('dash.addFirst')}</a>`}
    </li>`;
}

function productItem(p) {
  const name = escapeHtml(productName(p));
  const thumb = p.product_images[0]?.url;
  const price = priceHtml({ price: p.price === null ? null : Number(p.price), compareAtPrice: p.compare_at_price === null ? null : Number(p.compare_at_price) }, 'dash-item__price');
  return `
    <li class="dash-item" data-id="${p.id}">
      <a class="dash-item__main" href="#edit/${p.id}">
        <span class="dash-item__thumb">${thumb ? `<img src="${escapeHtml(thumb)}" alt="" loading="lazy">` : icon('image')}</span>
        <span class="dash-item__body">
          <span class="dash-item__name">${name}</span>
          <span class="dash-item__meta"><span class="status-badge" data-status="${p.status}">${statusLabel(p.status)}</span>${price}</span>
          ${p.status === 'rejected' && p.review_note ? `<span class="dash-item__note">${t('dash.rejectedBecause')} ${escapeHtml(p.review_note)}</span>` : ''}
          <span class="dash-item__date">${t('dash.updated', { date: formatDate(p.updated_at) })}</span>
        </span>
      </a>
      <div class="dash-item__actions">
        <a class="icon-btn" href="#edit/${p.id}" aria-label="${t('dash.edit')}: ${name}">${icon('edit')}</a>
        <button class="icon-btn" type="button" data-delete="${p.id}" aria-label="${t('dash.delete')}: ${name}">${icon('trash')}</button>
      </div>
      ${confirmBox(p.id, name)}
    </li>`;
}

// "Are you sure?" shown inside the page (no browser pop-up)
function confirmBox(id, name) {
  return `
    <div class="dash-confirm" data-confirm-for="${id}" hidden>
      <p>${t('dash.confirmDelete', { name })}</p>
      <div class="btn-row">
        <button class="btn btn--small btn--solid" type="button" data-confirm-delete="${id}">${t('dash.confirmYes')}</button>
        <button class="btn btn--small" type="button" data-cancel-delete="${id}">${t('dash.cancel')}</button>
      </div>
    </div>`;
}

function wireProductList() {
  $('product-search').addEventListener('input', (event) => {
    query = event.target.value;
    renderProductList();
  });
  $('status-filter').addEventListener('click', (event) => {
    const button = event.target.closest('[data-status]');
    if (!button) return;
    filter = button.dataset.status;
    renderProductList();
  });
  // Delete buttons work the same in the list and in the form
  document.addEventListener('click', async (event) => {
    const ask = event.target.closest('[data-delete]');
    const yes = event.target.closest('[data-confirm-delete]');
    const no = event.target.closest('[data-cancel-delete]');
    if (ask) {
      const box = document.querySelector(`[data-confirm-for="${ask.dataset.delete}"]`);
      box.hidden = false;
      box.querySelector('[data-confirm-delete]').focus();
    } else if (no) {
      document.querySelector(`[data-confirm-for="${no.dataset.cancelDelete}"]`).hidden = true;
    } else if (yes) {
      await deleteProduct(yes.dataset.confirmDelete, yes);
    }
  });
}

async function deleteProduct(id, button) {
  const product = products.find((p) => p.id === id);
  setBusy(button, true, t('dash.deleting'));
  // Deleting the product also deletes its image rows (on delete cascade)
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) {
    setBusy(button, false);
    showMessage($('dash-message'), t(errorKey(error)));
    return;
  }
  // Then the files themselves (best effort)
  const paths = (product?.product_images ?? []).map((image) => pathFromUrl(image.url)).filter(Boolean);
  if (paths.length) await supabase.storage.from(BUCKET).remove(paths);
  products = products.filter((p) => p.id !== id);
  showMessage($('dash-message'), t('dash.deleted', { name: productName(product) }));
  if (location.hash === '#products' || !location.hash) renderProductList();
  else location.hash = '#products';
}

/* ---------- Add / edit a product ---------- */

// Chips for section, sizes, colors and occasions, built once from lookups.json
function buildProductOptions() {
  const chip = (type, name, value, label) => `
    <label class="chip"><input type="${type}" name="${name}" value="${escapeHtml(value)}"><span>${escapeHtml(label)}</span></label>`;
  const audienceName = (id) => localize(lookups.audiences.find((a) => a.id === id)?.name);

  $('pf-section').innerHTML = SECTIONS.map((id) => chip('radio', 'section', id, audienceName(id))).join('');
  $('pf-category').innerHTML = `<option value="">${t('dash.chooseCategory')}</option>`
    + lookups.categories.map((c) => `<option value="${c.id}">${escapeHtml(localize(c.name))}</option>`).join('');
  $('pf-sizes').innerHTML = lookups.sizeGroups.map((group) => `
    <p class="dash-size-group">${escapeHtml(localize(group.name))}</p>
    <div class="chips">${group.sizes.map((size) => chip('checkbox', 'sizes', size, sizeLabel(size))).join('')}</div>`).join('');
  $('pf-colors').innerHTML = lookups.colors.map((c) => chip('checkbox', 'colors', c.id, localize(c.name))).join('');
  $('pf-occasions').innerHTML = lookups.occasions.map((o) => chip('checkbox', 'occasions', o.id, localize(o.name))).join('');
}

function openProductForm(product) {
  const form = productForm();
  form.reset();
  editing = product;
  images.forEach((image) => image.blob && URL.revokeObjectURL(image.preview));
  images = (product?.product_images ?? []).map((image) => ({ ...image, preview: image.url }));
  removedImages = [];
  form.querySelectorAll('[aria-invalid]').forEach(clearFieldError);
  form.querySelectorAll('.field__error').forEach((el) => { el.hidden = true; });
  showMessage($('pf-error'), '');
  showMessage($('pf-progress'), '');

  $('pf-title').textContent = product ? t('dash.editProduct') : t('dash.newProduct');
  const badge = $('pf-status');
  badge.hidden = !product;
  if (product) {
    badge.textContent = statusLabel(product.status);
    badge.dataset.status = product.status;
  }
  const note = $('pf-review-note');
  note.hidden = !(product?.status === 'rejected' && product.review_note);
  if (!note.hidden) note.textContent = `${t('dash.rejectedBecause')} ${product.review_note}`;
  $('pf-published-note').hidden = product?.status !== 'published';

  if (product) {
    const f = form.elements;
    f.name_ar.value = product.name_ar ?? '';
    f.name_en.value = product.name_en ?? '';
    f.description_ar.value = product.description_ar ?? '';
    f.description_en.value = product.description_en ?? '';
    f.category.value = product.category ?? '';
    f.price.value = product.price ?? '';
    f.compare_at_price.value = product.compare_at_price ?? '';
    f.made_in_palestine.checked = product.made_in_palestine;
    const check = (name, values) => form.querySelectorAll(`input[name="${name}"]`).forEach((input) => {
      input.checked = values.includes(input.value);
    });
    check('section', [product.section]);
    check('sizes', product.sizes ?? []);
    check('colors', product.colors ?? []);
    check('occasions', product.occasions ?? []);
  }

  const del = $('pf-delete');
  del.hidden = !product;
  del.innerHTML = product ? `
    <button class="text-btn dash-delete" type="button" data-delete="${product.id}">${icon('trash')} ${t('dash.deleteProduct')}</button>
    ${confirmBox(product.id, escapeHtml(productName(product)))}` : '';

  renderImages();
}

function renderImages() {
  const last = images.length - 1;
  $('pf-images').innerHTML = images.map((image, i) => `
    <li class="image-tile">
      <img src="${escapeHtml(image.preview)}" alt="">
      <span class="image-tile__number">${i === 0 ? t('dash.mainImage') : i + 1}</span>
      <div class="image-tile__actions">
        <button class="icon-btn move-earlier" type="button" data-move="${i}" data-by="-1" ${i === 0 ? 'disabled' : ''} aria-label="${t('dash.moveEarlier', { n: i + 1 })}">${icon('chevron')}</button>
        <button class="icon-btn" type="button" data-remove-image="${i}" aria-label="${t('dash.removeImage', { n: i + 1 })}">${icon('close')}</button>
        <button class="icon-btn move-later" type="button" data-move="${i}" data-by="1" ${i === last ? 'disabled' : ''} aria-label="${t('dash.moveLater', { n: i + 1 })}">${icon('chevron')}</button>
      </div>
    </li>`).join('');
  $('pf-images-count').textContent = `(${images.length}/${MAX_IMAGES})`;
  const full = images.length >= MAX_IMAGES;
  $('pf-images-add').classList.toggle('is-disabled', full);
  $('pf-images-input').disabled = full;
}

function readProductForm() {
  const form = productForm();
  const f = form.elements;
  const values = (name) => [...form.querySelectorAll(`input[name="${name}"]:checked`)].map((input) => input.value);
  const amount = (input) => (input.value.trim() === '' ? null : Number(input.value));
  return {
    name_ar: f.name_ar.value.trim() || null,
    name_en: f.name_en.value.trim() || null,
    description_ar: f.description_ar.value.trim() || null,
    description_en: f.description_en.value.trim() || null,
    section: values('section')[0] ?? null,
    category: f.category.value || null,
    sizes: values('sizes'),
    colors: values('colors'),
    occasions: values('occasions'),
    made_in_palestine: f.made_in_palestine.checked,
    price: amount(f.price),
    compare_at_price: amount(f.compare_at_price),
  };
}

// A draft only needs a name; "send for review" needs everything an admin checks
function validateProduct(row, status) {
  const form = productForm();
  const errors = [];
  const fail = (element, key) => {
    if (element.matches('input, select, textarea')) showFieldError(element, t(key));
    else showMessage(element, t(key));
    errors.push(element);
  };
  form.querySelectorAll('[aria-invalid]').forEach(clearFieldError);
  ['pf-section-error', 'pf-sizes-error', 'pf-images-error'].forEach((id) => showMessage($(id), ''));
  const f = form.elements;

  if (status === 'draft' && !row.name_ar && !row.name_en) fail(f.name_ar, 'dash.errorName');
  if (status === 'pending') {
    if (!row.name_ar) fail(f.name_ar, 'form.errors.required');
    if (!row.name_en) fail(f.name_en, 'form.errors.required');
    if (!row.section) fail($('pf-section-error'), 'dash.errorSection');
    if (!row.category) fail(f.category, 'form.errors.required');
    if (!row.sizes.length) fail($('pf-sizes-error'), 'dash.errorSizes');
    if (!images.length) fail($('pf-images-error'), 'dash.errorImages');
  }
  const badAmount = (value) => value !== null && (!Number.isFinite(value) || value < 0 || value > 99999999);
  if (badAmount(row.price)) fail(f.price, 'dash.errorPrice');
  if (badAmount(row.compare_at_price)) fail(f.compare_at_price, 'dash.errorPrice');
  else if (row.compare_at_price !== null && (row.price === null || row.compare_at_price <= row.price)) {
    fail(f.compare_at_price, 'dash.errorCompare');
  }

  const first = errors[0];
  if (first) (first.matches('input, select, textarea') ? first : first.previousElementSibling ?? first).focus?.();
  first?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  return errors.length === 0;
}

async function saveProduct(status, button) {
  const row = { ...readProductForm(), status };
  showMessage($('pf-error'), '');
  if (!validateProduct(row, status)) return;

  const buttons = productForm().querySelectorAll('.dash-actions button');
  buttons.forEach((b) => { b.disabled = true; });
  setBusy(button, true, t('dash.saving'));
  const progress = $('pf-progress');
  try {
    let id = editing?.id;
    if (id) {
      const { error } = await supabase.from('products').update(row).eq('id', id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from('products').insert({ ...row, store_id: store.id }).select('id').single();
      if (error) throw error;
      id = data.id;
      editing = { id };
    }

    // Photos the owner removed
    for (const image of removedImages) {
      const { error } = await supabase.from('product_images').delete().eq('id', image.id);
      if (error) throw error;
      const path = pathFromUrl(image.url);
      if (path) await supabase.storage.from(BUCKET).remove([path]);
    }
    removedImages = [];

    // New photos are uploaded into the store's own folder: <store id>/<product id>/...
    const total = images.filter((image) => image.blob).length;
    let done = 0;
    for (const [position, image] of images.entries()) {
      if (image.blob) {
        done += 1;
        showMessage(progress, t('dash.uploading', { n: done, total }));
        const path = `${store.id}/${id}/${uniqueId()}.${extensionFor(image.blob)}`;
        const upload = await supabase.storage.from(BUCKET).upload(path, image.blob, { contentType: image.blob.type, cacheControl: '31536000' });
        if (upload.error) throw upload.error;
        const url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        const { data, error } = await supabase.from('product_images').insert({ product_id: id, url, position }).select('id').single();
        if (error) throw error;
        URL.revokeObjectURL(image.preview);
        Object.assign(image, { id: data.id, url, preview: url, blob: null, position });
      } else if (image.position !== position) {
        const { error } = await supabase.from('product_images').update({ position }).eq('id', image.id);
        if (error) throw error;
        image.position = position;
      }
    }

    await loadProducts();
    showMessage(progress, '');
    showMessage($('dash-message'), t(status === 'pending' ? 'dash.sentForReview' : 'dash.savedDraft', { name: productName(row) }));
    location.hash = '#products';
  } catch (error) {
    showMessage(progress, '');
    showMessage($('pf-error'), t(errorKey(error)));
  } finally {
    setBusy(button, false);
    buttons.forEach((b) => { b.disabled = false; });
  }
}

function wireProductForm() {
  const form = productForm();
  clearErrorsOnInput(form);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const button = event.submitter ?? form.querySelector('[data-status="draft"]');
    saveProduct(button.dataset.status, button);
  });
  form.addEventListener('change', (event) => {
    if (event.target.name === 'section') showMessage($('pf-section-error'), '');
    if (event.target.name === 'sizes') showMessage($('pf-sizes-error'), '');
  });

  // Choosing photos: each is shrunk to WebP right away (max 1600px)
  $('pf-images-input').addEventListener('change', async (event) => {
    const files = [...event.target.files];
    event.target.value = ''; // so choosing the same file again still works
    const error = $('pf-images-error');
    showMessage(error, '');
    const room = MAX_IMAGES - images.length;
    if (files.length > room) showMessage(error, t('dash.tooManyImages', { max: MAX_IMAGES }));
    showMessage($('pf-progress'), t('dash.preparingImages'));
    for (const file of files.slice(0, room)) {
      try {
        const blob = await compressImage(file);
        images.push({ blob, preview: URL.createObjectURL(blob) });
      } catch {
        showMessage(error, t('dash.imageError', { name: file.name }));
      }
    }
    showMessage($('pf-progress'), '');
    renderImages();
  });

  // Reorder / remove photos
  $('pf-images').addEventListener('click', (event) => {
    const move = event.target.closest('[data-move]');
    const remove = event.target.closest('[data-remove-image]');
    if (move) {
      const from = Number(move.dataset.move);
      const to = from + Number(move.dataset.by);
      [images[from], images[to]] = [images[to], images[from]];
      renderImages();
      $('pf-images').querySelector(`[data-move="${to}"][data-by="${move.dataset.by}"]:not([disabled])`)?.focus();
    } else if (remove) {
      const [image] = images.splice(Number(remove.dataset.removeImage), 1);
      if (image.id) removedImages.push(image);
      else URL.revokeObjectURL(image.preview);
      renderImages();
    }
  });
}

/* ---------- Store details ---------- */

function openStoreForm() {
  const form = $('store-form');
  newLogo = null;
  $('sf-name').textContent = store.name;
  $('sf-city').textContent = store.city ?? '—';
  form.elements.description.value = store.description ?? '';
  form.elements.instagram.value = store.instagram ?? '';
  form.elements.whatsapp.value = store.whatsapp ?? '';
  showMessage($('sf-saved'), '');
  showMessage($('sf-error'), '');
  renderLogoPreview(store.logo_url);
}

function renderLogoPreview(src) {
  $('sf-logo-preview').innerHTML = src
    ? `<img src="${escapeHtml(src)}" alt="${escapeHtml(t('dash.logoAlt', { name: store.name }))}">`
    : `<span class="monogram" aria-hidden="true">${escapeHtml(store.name.charAt(0))}</span>`;
}

function wireStoreForm() {
  const form = $('store-form');
  clearErrorsOnInput(form);

  $('sf-logo-input').addEventListener('change', async (event) => {
    const [file] = event.target.files;
    event.target.value = '';
    if (!file) return;
    try {
      newLogo = await compressImage(file, { maxSize: 512 });
      renderLogoPreview(URL.createObjectURL(newLogo));
    } catch {
      showMessage($('sf-error'), t('dash.imageError', { name: file.name }));
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage($('sf-error'), '');
    showMessage($('sf-saved'), '');
    const optionalPhone = (value) => (value ? phoneRule(value) : '');
    if (!validateForm(form, { instagram: instagramRule, whatsapp: optionalPhone })) return;

    const button = form.querySelector('[type="submit"]');
    setBusy(button, true, t('dash.saving'));
    try {
      const changes = {
        description: form.elements.description.value.trim() || null,
        instagram: form.elements.instagram.value.trim() || null,
        whatsapp: form.elements.whatsapp.value.trim() || null,
      };
      const oldLogoPath = store.logo_url ? pathFromUrl(store.logo_url) : '';
      if (newLogo) {
        const path = `${store.id}/logo-${uniqueId()}.${extensionFor(newLogo)}`;
        const upload = await supabase.storage.from(BUCKET).upload(path, newLogo, { contentType: newLogo.type, cacheControl: '31536000' });
        if (upload.error) throw upload.error;
        changes.logo_url = supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      }
      // Only these columns: the name, address, city and verified badge are admin-only
      const { error } = await supabase.from('stores').update(changes).eq('id', store.id);
      if (error) throw error;
      if (newLogo && oldLogoPath) await supabase.storage.from(BUCKET).remove([oldLogoPath]);
      Object.assign(store, changes);
      newLogo = null;
      showMessage($('sf-saved'), t('account.saved'));
    } catch (error) {
      showMessage($('sf-error'), t(errorKey(error)));
    } finally {
      setBusy(button, false);
    }
  });
}

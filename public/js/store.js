loadData().then(({ stores, products }) => {
  const main = document.getElementById('store');
  const id = Number(new URLSearchParams(location.search).get('id'));
  const store = stores.find(s => s.id === id);

  if (!store) {
    main.innerHTML = `
      <section class="empty-state container">
        <span class="eyebrow">Not Found</span>
        <h1 class="section-title">المتجر غير موجود</h1>
        <p>ربما تم حذف المتجر أو أن الرابط غير صحيح.</p>
        <a class="btn" href="/stores.html">كل المتاجر</a>
      </section>`;
    return;
  }

  document.title = `${store.name} — Nexaro`;
  const storeProducts = products.filter(p => p.storeId === store.id);

  main.innerHTML = `
    <section class="store-hero container">
      <div class="name-en en">${escapeHtml(store.nameEn)}</div>
      <h1>${escapeHtml(store.name)}</h1>
      <div class="city">${escapeHtml(store.city)}</div>
      <p class="desc">${escapeHtml(store.description)}</p>
    </section>
    <section class="section">
      <div class="container">
        <div class="section-head">
          <div>
            <span class="eyebrow">Collection</span>
            <h2 class="section-title">المنتجات</h2>
          </div>
          <span class="muted">${storeProducts.length} قطع</span>
        </div>
        <div class="grid grid-3">
          ${storeProducts.map(p => productCard(p, store)).join('') || '<p class="muted">لا توجد منتجات بعد.</p>'}
        </div>
      </div>
    </section>`;
});

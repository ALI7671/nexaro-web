loadData().then(({ stores, products }) => {
  const storeById = id => stores.find(s => s.id === id);

  document.getElementById('featured-stores').innerHTML = stores
    .filter(s => s.featured)
    .map(storeCard)
    .join('');

  document.getElementById('featured-products').innerHTML = products
    .filter(p => p.featured && storeById(p.storeId))
    .map(p => productCard(p, storeById(p.storeId)))
    .join('');
});

loadData().then(({ stores }) => {
  document.getElementById('stores').innerHTML = stores.map(storeCard).join('');
});

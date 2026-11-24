const state = { products: [], cart: [], category: 'all', sort: 'default', query: '', wishlist: new Set(JSON.parse(localStorage.getItem('shop-wishlist') || '[]')), wishlistOnly: false, paymentInfo: { upiId: '', qrImage: '', upiAvailable: false } };
const money = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const $ = (selector) => document.querySelector(selector);

async function api(path, options = {}) {
  const apiBase = window.SHOP_API_BASE || '/api';
  const response = await fetch(`${apiBase}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.');
  return data;
}

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

function showNotice(message, kind = 'success') {
  const notice = $('#notice');
  notice.textContent = message;
  notice.className = `notice visible ${kind}`;
  window.clearTimeout(showNotice.timer);
  showNotice.timer = window.setTimeout(() => { notice.className = 'notice'; }, 4500);
}

async function loadProducts() {
  $('#products').innerHTML = '<div class="loading-state">Finding the good stuffâ€¦</div>';
  try {
    const data = await api('/products');
    state.products = data.products;
    const categories = [...new Set(state.products.map((product) => product.category))].sort();
    $('#categoryFilter').innerHTML = '<option value="all">All categories</option>' + categories.map((category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`).join('');
    $('#categoryChips').innerHTML = ['all', ...categories].map((category) => `<button type="button" class="category-chip ${state.category === category ? 'active' : ''}" data-category="${escapeHtml(category)}">${category === 'all' ? 'All' : escapeHtml(category)}</button>`).join('');
    renderWishlistCount();
    renderProducts();
  } catch (error) {
    $('#products').innerHTML = `<div class="empty-state">${escapeHtml(error.message)} <button class="text-button" id="retryProducts">Try again</button></div>`;
    $('#retryProducts').addEventListener('click', loadProducts);
  }
}

function renderProducts() {
  let products = state.products.filter((product) => product.title.toLowerCase().includes(state.query));
  if (state.category !== 'all') products = products.filter((product) => product.category === state.category);
  if (state.wishlistOnly) products = products.filter((product) => state.wishlist.has(product.id));
  if (state.sort === 'low') products.sort((a, b) => a.price - b.price);
  if (state.sort === 'high') products.sort((a, b) => b.price - a.price);
  $('#productCount').textContent = `${products.length} ${products.length === 1 ? 'item' : 'items'}`;
  if (!products.length) {
    $('#products').innerHTML = '<div class="empty-state">No products match that search. Try another one.</div>';
    return;
  }
  $('#products').innerHTML = products.map((product) => `<article class="product-card" data-product-card="${product.id}">
    <div class="product-image" data-view="${product.id}"><img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}" loading="lazy"><span class="category-pill">${escapeHtml(product.category)}</span><button class="wishlist-button ${state.wishlist.has(product.id) ? 'saved' : ''}" data-wishlist="${product.id}" type="button" aria-label="${state.wishlist.has(product.id) ? 'Remove from' : 'Add to'} saved products">${state.wishlist.has(product.id) ? 'â™¥' : 'â™¡'}</button><span class="quick-view-label">Quick view</span></div>
    <div class="product-info"><h3 data-view="${product.id}">${escapeHtml(product.title)}</h3><p>${escapeHtml(product.description)}</p><div class="product-bottom"><div><strong>${money.format(product.price)}</strong><small class="stock-label">${product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}</small></div><div class="product-actions"><button class="add-button" data-add="${product.id}" type="button" ${product.stock < 1 ? 'disabled' : ''} aria-label="Add ${escapeHtml(product.title)} to cart">Add <span>+</span></button><button class="buy-button" data-buy="${product.id}" type="button" ${product.stock < 1 ? 'disabled' : ''}>Buy now</button></div></div></div>
  </article>`).join('');
}

function renderCart() {
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  $('#cartCount').textContent = count;
  $('#drawerCount').textContent = count;
  $('#cartSummary').textContent = count ? `${count} ${count === 1 ? 'item' : 'items'}` : 'Nothing added yet';
  $('#cartTotal').textContent = money.format(total);
  $('#drawerTotal').textContent = money.format(total);
  $('#checkoutButton').disabled = count === 0;
  $('#drawerCheckout').disabled = count === 0;
  if (!state.cart.length) {
    $('#cartItems').innerHTML = '<div class="empty-cart"><span>🛍️</span><p>Your cart is waiting for something good.</p><a href="#shop">Explore the shop ↑</a></div>';
    $('#drawerItems').innerHTML = '<div class="drawer-empty"><span>✦</span><strong>Your bag is ready for a little joy.</strong><a href="#shop" data-close-drawer>Explore products ↗</a></div>';
    return;
  }
  const markup = (drawer = false) => state.cart.map((item) => `<div class="${drawer ? 'drawer-item' : 'cart-item'}"><img src="${escapeHtml(item.image)}" alt=""><div class="cart-item-name"><strong>${escapeHtml(item.title)}</strong><span>${money.format(item.price)} each</span></div><div class="quantity-control"><button data-qty="-1" data-id="${item.productId}" aria-label="Remove one ${escapeHtml(item.title)}" type="button">−</button><span>${item.quantity}</span><button data-qty="1" data-id="${item.productId}" aria-label="Add one ${escapeHtml(item.title)}" type="button">+</button></div>${drawer ? '' : `<strong class="line-total">${money.format(item.price * item.quantity)}</strong>`}<button class="remove-button" data-remove="${item.productId}" type="button" aria-label="Remove ${escapeHtml(item.title)}">×</button></div>`).join('');
  $('#cartItems').innerHTML = markup();
  $('#drawerItems').innerHTML = markup(true);
}async function refreshCart() { const data = await api('/cart'); state.cart = data.items; renderCart(); }
async function changeQuantity(productId, quantity) {
  const data = await api('/cart/items', { method: 'POST', body: JSON.stringify({ productId, quantity }) });
  state.cart = data.items;
  renderCart();
}

function renderWishlistCount() { $('#wishlistCount').textContent = state.wishlist.size; $('#savedNavCount').textContent = state.wishlist.size; }
function toggleWishlist(id) {
  state.wishlist.has(id) ? state.wishlist.delete(id) : state.wishlist.add(id);
  localStorage.setItem('shop-wishlist', JSON.stringify([...state.wishlist]));
  renderWishlistCount(); renderProducts();
}
function showProduct(product) {
  $('#productDialogContent').innerHTML = `<img class="quick-view-image" src="${escapeHtml(product.image)}" alt="${escapeHtml(product.title)}"><div class="quick-view-copy"><span class="category-pill static-pill">${escapeHtml(product.category)}</span><h2>${escapeHtml(product.title)}</h2><p>${escapeHtml(product.description)}</p><strong class="quick-view-price">${money.format(product.price)}</strong><small class="stock-label">${product.stock > 0 ? `${product.stock} available` : 'Out of stock'}</small><button class="add-button quick-add" data-add="${product.id}" type="button" ${product.stock < 1 ? 'disabled' : ''}>Add to cart <span>+</span></button></div>`;
  $('#productDialog').showModal();
}

async function start() {
  $('#searchInput').addEventListener('input', (event) => { state.query = event.target.value.trim().toLowerCase(); renderProducts(); });
  $('#categoryFilter').addEventListener('change', (event) => { state.category = event.target.value; renderProducts(); });
  $('#sortFilter').addEventListener('change', (event) => { state.sort = event.target.value; renderProducts(); });
  $('#categoryChips').addEventListener('click', (event) => { const chip = event.target.closest('[data-category]'); if (!chip) return; state.category = chip.dataset.category; $('#categoryFilter').value = state.category; renderProducts(); $('#categoryChips').querySelectorAll('.category-chip').forEach((item) => item.classList.toggle('active', item === chip)); });
  $('#wishlistFilter').addEventListener('click', (event) => { state.wishlistOnly = !state.wishlistOnly; event.currentTarget.classList.toggle('active', state.wishlistOnly); event.currentTarget.setAttribute('aria-pressed', state.wishlistOnly); renderProducts(); });
  $('#clearFilters').addEventListener('click', () => { state.query = ''; state.category = 'all'; state.sort = 'default'; state.wishlistOnly = false; $('#searchInput').value = ''; $('#categoryFilter').value = 'all'; $('#sortFilter').value = 'default'; $('#wishlistFilter').classList.remove('active'); $('#wishlistFilter').setAttribute('aria-pressed', 'false'); renderProducts(); $('#categoryChips').querySelectorAll('.category-chip').forEach((chip) => chip.classList.toggle('active', chip.dataset.category === 'all')); });
  $('#mobileMenuButton').addEventListener('click', () => { const open = $('#mainNav').classList.toggle('nav-open'); $('#mobileMenuButton').setAttribute('aria-expanded', String(open)); });
  $('#mainNav').addEventListener('click', (event) => { if (event.target.closest('a')) { $('#mainNav').classList.remove('nav-open'); $('#mobileMenuButton').setAttribute('aria-expanded', 'false'); } });
  $('#savedNavButton').addEventListener('click', () => { state.wishlistOnly = true; $('#wishlistFilter').classList.add('active'); $('#wishlistFilter').setAttribute('aria-pressed', 'true'); renderProducts(); $('#shop').scrollIntoView({ behavior: 'smooth' }); });
  $('#trackOrderButton').addEventListener('click', () => { $('#trackResult').innerHTML = ''; $('#trackDialog').showModal(); $('#mainNav').classList.remove('nav-open'); });
  $('#closeTrackDialog').addEventListener('click', () => $('#trackDialog').close());
  $('#trackDialog').addEventListener('click', (event) => { if (event.target === $('#trackDialog')) $('#trackDialog').close(); });
  $('#trackForm').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('[type="submit"]'); const resultBox = $('#trackResult'); button.disabled = true; resultBox.innerHTML = '<p>Looking up your order…</p>';
    try {
      const values = new URLSearchParams(new FormData(form));
      const result = await api(`/orders/track?${values}`);
      const steps = ['pending','confirmed','packed','shipped','delivered']; const current = steps.indexOf(result.status);
      resultBox.innerHTML = `<div class="track-card"><div class="track-card-head"><strong>${escapeHtml(result.orderNumber)}</strong><span class="status-tag">${escapeHtml(result.status)}</span></div><p>${result.status === 'cancelled' ? 'This order was cancelled.' : `Current status: <strong>${escapeHtml(result.status)}</strong>`}</p>${result.status === 'cancelled' ? '' : `<div class="tracking-steps">${steps.map((step, index) => `<span class="${current >= index ? 'complete' : ''}"><i>${current >= index ? '✓' : index + 1}</i>${step}</span>`).join('')}</div>`}<ul>${result.items.map((item) => `<li>${escapeHtml(item.title)} × ${item.quantity}</li>`).join('')}</ul><strong>${money.format(result.total)}</strong><small>${result.paymentMethod === 'upi' ? 'UPI · payment verification pending' : 'Cash on delivery'}</small></div>`;
    } catch (error) { resultBox.innerHTML = `<p class="track-error">${escapeHtml(error.message)}</p>`; }
    finally { button.disabled = false; }
  });
  $('#products').addEventListener('click', async (event) => {
    const heart = event.target.closest('[data-wishlist]');
    if (heart) { event.stopPropagation(); toggleWishlist(Number(heart.dataset.wishlist)); return; }
    const button = event.target.closest('[data-add]');
    if (button) { button.disabled = true; try { await changeQuantity(Number(button.dataset.add), 1); button.classList.add('added'); openCartDrawer(); showNotice('Added to your bag.'); window.setTimeout(() => button.classList.remove('added'), 800); } catch (error) { showNotice(error.message, 'error'); } finally { button.disabled = false; } return; }
    const buyButton = event.target.closest('[data-buy]');
    if (buyButton) { buyButton.disabled = true; try { await changeQuantity(Number(buyButton.dataset.buy), 1); closeCartDrawer(); $('#checkoutError').textContent = ''; $('#checkoutDialog').showModal(); } catch (error) { showNotice(error.message, 'error'); } finally { buyButton.disabled = false; } return; }
    const view = event.target.closest('[data-view]'); if (view) { const product = state.products.find((item) => item.id === Number(view.dataset.view)); if (product) showProduct(product); }
  });
  const productDialog = $('#productDialog');
  $('#closeProductDialog').addEventListener('click', () => productDialog.close());
  productDialog.addEventListener('click', (event) => { if (event.target === productDialog) productDialog.close(); });
  productDialog.addEventListener('click', async (event) => { const button = event.target.closest('[data-add]'); if (!button) return; button.disabled = true; try { await changeQuantity(Number(button.dataset.add), 1); showNotice('Added to your bag.'); productDialog.close(); openCartDrawer(); } catch (error) { showNotice(error.message, 'error'); } finally { button.disabled = false; } });
  $('#cartItems').addEventListener('click', (event) => {
    const quantityButton = event.target.closest('[data-qty]');
    const removeButton = event.target.closest('[data-remove]');
    if (quantityButton) changeQuantity(Number(quantityButton.dataset.id), Number(quantityButton.dataset.qty));
    if (removeButton) changeQuantity(Number(removeButton.dataset.remove), 0);
  });
  $('#drawerItems').addEventListener('click', (event) => {
    if (event.target.closest('[data-close-drawer]')) { closeCartDrawer(); return; }
    const quantityButton = event.target.closest('[data-qty]'), removeButton = event.target.closest('[data-remove]');
    if (quantityButton) changeQuantity(Number(quantityButton.dataset.id), Number(quantityButton.dataset.qty));
    if (removeButton) changeQuantity(Number(removeButton.dataset.remove), 0);
  });
  $('#openCart').addEventListener('click', openCartDrawer);
  $('#closeCart').addEventListener('click', closeCartDrawer);
  $('#cartBackdrop').addEventListener('click', closeCartDrawer);
  $('#drawerCheckout').addEventListener('click', () => { closeCartDrawer(); $('#checkoutDialog').showModal(); });
  $('#categoryTiles').addEventListener('click', (event) => { const tile = event.target.closest('[data-tile-category]'); if (!tile) return; event.preventDefault(); state.category = tile.dataset.tileCategory; $('#categoryFilter').value = state.category; renderProducts(); $('#categoryChips').querySelectorAll('.category-chip').forEach((chip) => chip.classList.toggle('active', chip.dataset.category === state.category)); $('#shop').scrollIntoView({ behavior: 'smooth' }); });
  const dialog = $('#checkoutDialog');
  $('#checkoutButton').addEventListener('click', () => dialog.showModal());
  $('#closeDialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  const paymentInfo = await api('/payment-info').catch(() => ({ qrImage: '', upiId: '', upiAvailable: false }));
  state.paymentInfo = paymentInfo;
  state.paymentInfo = paymentInfo;
  const paymentQr = $('#paymentQr');
  if (paymentInfo.qrImage) { paymentQr.src = paymentInfo.qrImage; paymentQr.hidden = false; }
  $('#upiIdLabel').textContent = paymentInfo.upiId ? `UPI ID: ${paymentInfo.upiId}` : '';
  if (!paymentInfo.upiAvailable) {
    const upiRadio = document.querySelector('input[name="paymentMethod"][value="upi"]');
    upiRadio.disabled = true;
    upiRadio.closest('.payment-option').classList.add('payment-unavailable');
    upiRadio.closest('.payment-option').querySelector('small').textContent = 'Shop owner needs to add QR / UPI ID';
  }
  const formPaymentMethod = () => document.querySelector('input[name="paymentMethod"]:checked')?.value || 'cod';
  const updatePaymentChoice = () => { const isUpi = formPaymentMethod() === 'upi'; $('#upiPaymentBox').hidden = !isUpi; $('#checkoutDialog .eyebrow').textContent = isUpi ? 'PAY BY UPI' : 'CASH ON DELIVERY'; $('#checkoutForm [type="submit"]').textContent = isUpi ? 'I’ve paid / Place order →' : 'Place COD order →'; };
  document.querySelectorAll('input[name="paymentMethod"]').forEach((radio) => radio.addEventListener('change', updatePaymentChoice));
  $('#upiPaymentMessage').textContent = paymentInfo.upiAvailable ? 'Scan this QR with any UPI app. After payment, place your order.' : 'UPI is not configured yet. Shop owner needs to add their QR image or UPI ID in .env.';
  $('#upiPaymentBox').insertAdjacentHTML('beforeend', paymentInfo.upiId ? `<a id="upiPayLink" class="upi-pay-link" href="#">Open UPI app ↗</a>` : '');
  const upiLink = $('#upiPayLink');
  if (upiLink) { const total = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0); upiLink.href = `upi://pay?pa=${encodeURIComponent(paymentInfo.upiId)}&pn=${encodeURIComponent('My Shop VIP')}&am=${total}&cu=INR&tn=${encodeURIComponent('My Shop order')}`; }
  updatePaymentChoice();
  $('#checkoutForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector('[type="submit"]');
    const errorBox = $('#checkoutError');
    submit.disabled = true;
    errorBox.textContent = '';
    const fields = Object.fromEntries(new FormData(form));
    try {
      const result = await api('/orders', { method: 'POST', body: JSON.stringify(fields) });
      form.reset();
      dialog.close();
      await refreshCart();
      showNotice(`Order ${result.orderNumber} placed! Weâ€™ll contact you to confirm delivery.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) { errorBox.textContent = error.message; }
    finally { submit.disabled = false; }
  });
  try { await Promise.all([loadProducts(), refreshCart()]); }
  catch (error) { showNotice(error.message, 'error'); }
}

start();

function openCartDrawer() { $('#cartDrawer').classList.add('open'); $('#cartBackdrop').classList.add('visible'); $('#cartDrawer').setAttribute('aria-hidden', 'false'); document.body.classList.add('drawer-open'); }
function closeCartDrawer() { $('#cartDrawer').classList.remove('open'); $('#cartBackdrop').classList.remove('visible'); $('#cartDrawer').setAttribute('aria-hidden', 'true'); document.body.classList.remove('drawer-open'); }



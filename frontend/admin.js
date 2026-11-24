const $ = (selector) => document.querySelector(selector);
const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const html = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
async function api(path, options = {}) {
  const apiBase = window.SHOP_API_BASE || '/api';
  const response = await fetch(`${apiBase}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}
function notice(message, error = false) { const box = $('#adminNotice'); box.textContent = message; box.className = `notice visible${error ? ' error' : ''}`; window.setTimeout(() => { box.className = 'notice'; }, 5000); }
function showDashboard() { $('#loginPanel').hidden = true; $('#dashboard').hidden = false; loadOrders(); window.clearInterval(showDashboard.timer); showDashboard.timer = window.setInterval(() => { if (!$('#dashboard').hidden && !$('#ordersTab').hidden) loadOrders(); }, 15000); }
async function loadProducts() {
  const data = await api('/products');
  $('#productList').innerHTML = data.products.map((p) => `<article class="admin-product"><img src="${html(p.image)}" alt=""><div class="admin-product-main"><strong>${html(p.title)}</strong><span>${html(p.category)} · ${inr.format(p.price)} · ${p.stock} in stock</span></div><button class="secondary-button" data-edit="${p.id}">Edit</button><button class="danger-button" data-archive="${p.id}">Archive</button></article>`).join('') || '<p class="muted">No active products yet.</p>';
}
const statusOptions = ['pending','confirmed','packed','shipped','delivered','cancelled'];
async function loadOrders() {
  $('#ordersList').innerHTML = '<p class="muted">Loading orders…</p>';
  try {
    const data = await api('/admin/orders');
    $('#ordersList').innerHTML = data.orders.map((order) => `<article class="order-card"><div class="order-top"><div><strong>${html(order.orderNumber)}</strong><span>${new Date(String(order.createdAt).replace(' ', 'T')).toLocaleString()}</span></div><strong>${inr.format(order.total)}</strong></div><div class="order-customer"><strong>${html(order.customerName)} · ${html(order.phone)}</strong><span>${html(order.address)}</span></div><ul class="order-items">${order.items.map((item) => `<li>${html(item.title)} × ${item.quantity} <span>${inr.format(item.price * item.quantity)}</span></li>`).join('')}</ul><div class="order-bottom"><span class="payment-badge">${order.paymentMethod === 'upi' ? `UPI · ${html(order.paymentStatus || 'verification pending')}` : 'Cash on delivery'}</span><label class="status-control">Status<select data-order-status="${order.id}" ${order.status === 'cancelled' ? 'disabled' : ''}>${statusOptions.map((status) => `<option value="${status}" ${status === order.status ? 'selected' : ''}>${status[0].toUpperCase() + status.slice(1)}</option>`).join('')}</select></label></div></article>`).join('') || '<div class="admin-empty">No orders yet. New customer orders will show here.</div>';
  } catch (error) { $('#ordersList').innerHTML = `<div class="admin-empty">${html(error.message)}</div>`; }
}
async function loadMessages() {
  $('#messagesList').innerHTML = '<p class="muted">Loading messages…</p>';
  try {
    const data = await api('/admin/messages');
    $('#messagesList').innerHTML = data.messages.map((message) => `<article class="message-card"><div class="order-top"><div><strong>${html(message.subject)}</strong><span>${new Date(String(message.createdAt).replace(' ', 'T')).toLocaleString()}</span></div><span class="status-tag">${html(message.status)}</span></div><div class="order-customer"><strong>${html(message.name)} · ${html(message.phone)}${message.email ? ` · ${html(message.email)}` : ''}</strong></div><p>${html(message.message).replace(/\n/g, '<br>')}</p></article>`).join('') || '<div class="admin-empty">No customer messages yet.</div>';
  } catch (error) { $('#messagesList').innerHTML = `<div class="admin-empty">${html(error.message)}</div>`; }
}
function resetProductForm() { $('#productForm').reset(); $('#productForm').elements.id.value = ''; $('#productFormError').textContent = ''; $('#productEditor').hidden = true; }
$('#loginForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget; const button = form.querySelector('button'); button.disabled = true; $('#loginError').textContent = '';
  try { await api('/admin/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) }); showDashboard(); }
  catch (error) { $('#loginError').textContent = error.message; }
  finally { button.disabled = false; }
});
$('#logoutButton').addEventListener('click', async () => { await api('/admin/logout', { method: 'POST' }).catch(() => {}); location.reload(); });
document.querySelectorAll('.admin-tab').forEach((tab) => tab.addEventListener('click', async () => {
  document.querySelectorAll('.admin-tab').forEach((item) => item.classList.toggle('active', item === tab));
  $('#ordersTab').hidden = tab.dataset.tab !== 'orders'; $('#productsTab').hidden = tab.dataset.tab !== 'products'; $('#messagesTab').hidden = tab.dataset.tab !== 'messages';
  if (tab.dataset.tab === 'products') try { await loadProducts(); } catch (error) { notice(error.message, true); }
  if (tab.dataset.tab === 'messages') await loadMessages();
}));
$('#refreshOrders').addEventListener('click', loadOrders);
$('#refreshMessages').addEventListener('click', loadMessages);
$('#addProductButton').addEventListener('click', () => { resetProductForm(); $('#productEditor').hidden = false; $('#productForm').elements.title.focus(); });
$('#cancelProductEdit').addEventListener('click', resetProductForm);
$('#productList').addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-edit]'), archive = event.target.closest('[data-archive]');
  if (edit) {
    try { const p = (await api('/products')).products.find((product) => product.id === Number(edit.dataset.edit)); if (!p) return; const form = $('#productForm'); for (const key of ['id','title','description','category','image','price','stock']) form.elements[key].value = p[key]; $('#productEditor').hidden = false; form.elements.title.focus(); }
    catch (error) { notice(error.message, true); }
  }
  if (archive && confirm('Archive this product? Existing orders will stay saved.')) {
    try { await api(`/admin/products/${archive.dataset.archive}`, { method: 'DELETE' }); await loadProducts(); notice('Product archived.'); }
    catch (error) { notice(error.message, true); }
  }
});
$('#productForm').addEventListener('submit', async (event) => {
  event.preventDefault(); const form = event.currentTarget, values = Object.fromEntries(new FormData(form)); const id = values.id; delete values.id; values.price = Number(values.price); values.stock = Number(values.stock);
  const button = form.querySelector('[type="submit"]'); button.disabled = true; $('#productFormError').textContent = '';
  try { await api(id ? `/admin/products/${id}` : '/admin/products', { method: id ? 'PUT' : 'POST', body: JSON.stringify(values) }); resetProductForm(); await loadProducts(); notice(id ? 'Product updated.' : 'Product added.'); }
  catch (error) { $('#productFormError').textContent = error.message; }
  finally { button.disabled = false; }
});
$('#ordersList').addEventListener('change', async (event) => {
  const select = event.target.closest('[data-order-status]'); if (!select) return; select.disabled = true;
  try { await api(`/admin/orders/${select.dataset.orderStatus}`, { method: 'PATCH', body: JSON.stringify({ status: select.value }) }); notice(`Order status changed to ${select.value}.`); await loadOrders(); }
  catch (error) { notice(error.message, true); await loadOrders(); }
});
api('/admin/orders').then(showDashboard).catch(() => {});

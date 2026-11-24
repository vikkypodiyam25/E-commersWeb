const $ = (selector) => document.querySelector(selector);
const apiBase = window.SHOP_API_BASE || '/api';
async function api(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, { credentials: 'include', headers: { 'Content-Type': 'application/json' }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not complete the request. Please try again.');
  return data;
}
function feedback(message, kind) { const box = $('#contactFeedback'); box.textContent = message; box.className = `contact-${kind} visible`; }

api('/store-info').then((info) => {
  if (info.legalName || info.shopName) $('#legalName').textContent = info.legalName || info.shopName;
  if (info.address) $('#shopAddress').textContent = info.address;
  if (info.phone) { $('#shopPhone').textContent = info.phone; $('#shopPhone').replaceWith(Object.assign(document.createElement('a'), { id: 'shopPhone', textContent: info.phone, href: `tel:${info.phone.replace(/[^+\d]/g, '')}` })); }
  if (info.email) { $('#shopEmail').textContent = info.email; $('#shopEmail').replaceWith(Object.assign(document.createElement('a'), { id: 'shopEmail', textContent: info.email, href: `mailto:${info.email}` })); }
  if (info.grievanceContact) $('#grievanceContact').textContent = info.grievanceContact;
}).catch(() => {});

$('#contactForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget, button = form.querySelector('[type="submit"]');
  button.disabled = true;
  $('#contactFeedback').className = '';
  try {
    const result = await api('/contact', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    feedback(`${result.message} Reference: ${result.messageId}`, 'success');
    form.reset();
  } catch (error) { feedback(error.message, 'error'); }
  finally { button.disabled = false; }
});

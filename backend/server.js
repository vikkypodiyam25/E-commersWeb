const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, randomInt, scryptSync, timingSafeEqual } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { MongoClient } = require('mongodb');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const FRONTEND_ROOT = path.join(PROJECT_ROOT, 'frontend');
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const entry = line.trim();
    if (!entry || entry.startsWith('#')) continue;
    const separator = entry.indexOf('=');
    if (separator < 1) continue;
    const key = entry.slice(0, separator).trim();
    let value = entry.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvFile(path.join(PROJECT_ROOT, '.env'));
loadEnvFile(path.join(__dirname, '.env'));
const PORT = Number(process.env.PORT) || 3000;
const FRONTEND_PORT = Number(process.env.FRONTEND_PORT) || 5173;
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || `http://localhost:${FRONTEND_PORT}`;
const DB_PATH = path.resolve(PROJECT_ROOT, process.env.DB_PATH || 'data/shop.sqlite');
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : 'Dantewada@123');
const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB = process.env.MONGODB_DB || 'my_shop_vip';
function isLocalMongoUri(uri) {
  try {
    const hostname = new URL(uri).hostname.replace(/^\[|\]$/g, '').toLowerCase();
    return hostname === 'localhost' || hostname === '::1' || hostname === '0.0.0.0' || /^127(?:\.\d{1,3}){3}$/.test(hostname);
  } catch { return false; }
}
const PAYMENT_QR_IMAGE = process.env.PAYMENT_QR_IMAGE || '/payment-qr.png';
const UPI_ID = process.env.UPI_ID || '';
const SHOP_NAME = process.env.SHOP_NAME || 'My Shop VIP';
const LEGAL_NAME = process.env.LEGAL_NAME || '';
const STORE_ADDRESS = process.env.STORE_ADDRESS || 'Metapal, Dantewada, Chhattisgarh, India';
const CONTACT_PHONE = process.env.CONTACT_PHONE || '';
const CONTACT_EMAIL = process.env.CONTACT_EMAIL || '';
const GRIEVANCE_CONTACT = process.env.GRIEVANCE_CONTACT || 'Shop owner / Customer Care';
const mongoClient = MONGODB_URI ? new MongoClient(MONGODB_URI) : null;
let mongoDb = null;
const adminSessions = new Map();
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`PRAGMA journal_mode = WAL;
CREATE TABLE IF NOT EXISTS products (id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL, price INTEGER NOT NULL CHECK(price >= 0), category TEXT NOT NULL, image TEXT NOT NULL, stock INTEGER NOT NULL DEFAULT 20, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS carts (id TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS cart_items (cart_id TEXT NOT NULL REFERENCES carts(id) ON DELETE CASCADE, product_id INTEGER NOT NULL REFERENCES products(id), quantity INTEGER NOT NULL CHECK(quantity > 0), PRIMARY KEY(cart_id, product_id));
CREATE TABLE IF NOT EXISTS orders (id INTEGER PRIMARY KEY AUTOINCREMENT, order_number TEXT UNIQUE NOT NULL, cart_id TEXT NOT NULL, customer_name TEXT NOT NULL, phone TEXT NOT NULL, address TEXT NOT NULL, total INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending', payment_method TEXT NOT NULL DEFAULT 'cod', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS order_items (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE, product_id INTEGER NOT NULL, title TEXT NOT NULL, price INTEGER NOT NULL, quantity INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS contact_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT NOT NULL, email TEXT NOT NULL DEFAULT '', subject TEXT NOT NULL, message TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);

const productColumns = new Set(db.prepare('PRAGMA table_info(products)').all().map((column) => column.name));
if (!productColumns.has('stock')) db.exec('ALTER TABLE products ADD COLUMN stock INTEGER NOT NULL DEFAULT 20');
const orderColumns = new Set(db.prepare('PRAGMA table_info(orders)').all().map((column) => column.name));
if (!orderColumns.has('payment_method')) db.exec("ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'cod'");

const seed = [
  [1, 'Everyday Smartphone', 'A dependable smartphone for everyday tasks, photos and staying connected.', 14999, 'Mobiles', 'https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?auto=format&fit=crop&w=900&q=85', 20],
  [2, 'Workday Laptop', 'A versatile laptop for study, work and entertainment on the go.', 49999, 'Computers', 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=900&q=85', 10],
  [3, 'Wireless Headphones', 'Comfortable wireless headphones with clear sound for music and calls.', 1999, 'Accessories', 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=85', 30],
  [4, 'Bluetooth Speaker', 'Take your playlists along with a compact, easy-to-carry speaker.', 2499, 'Accessories', 'https://images.unsplash.com/photo-1608043152269-423dbba4e7e1?auto=format&fit=crop&w=900&q=85', 15],
  [5, 'Fitness Smartwatch', 'A handy everyday watch for notifications and activity tracking.', 3299, 'Wearables', 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=900&q=85', 12],
  [6, 'Fast USB-C Charger', 'A compact USB-C wall charger for your compatible devices.', 899, 'Accessories', 'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=900&q=85', 40]
];
const insertProduct = db.prepare('INSERT OR IGNORE INTO products(id,title,description,price,category,image,stock) VALUES(?,?,?,?,?,?,?)');
for (const product of seed) insertProduct.run(...product);

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
const carts = new Map();
const json = (res, status, data, headers = {}) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers }); res.end(JSON.stringify(data)); };
const safeEqual = (left, right) => { const a = scryptSync(String(left), 'my-shop-vip-admin', 32), b = scryptSync(String(right), 'my-shop-vip-admin', 32); return timingSafeEqual(a,b); };
function isAdmin(req) { const token = (req.headers.cookie || '').match(/(?:^|;\s*)shop_admin=([a-f0-9-]{36})/i)?.[1]; return Boolean(token && adminSessions.has(token)); }
function adminOnly(req, res) { if (isAdmin(req)) return true; json(res, 401, { error: 'Please sign in as the shop admin.' }); return false; }
const withCartCookie = (res, cartId) => { if (res.getHeader('Set-Cookie')) return; res.setHeader('Set-Cookie', `shop_cart=${cartId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`); };
function getCartId(req) {
  const cookie = req.headers.cookie || '';
  const found = cookie.match(/(?:^|;\s*)shop_cart=([a-f0-9-]{36})/i);
  if (found && db.prepare('SELECT id FROM carts WHERE id=?').get(found[1])) { carts.set(found[1], Date.now()); return found[1]; }
  const id = randomUUID();
  db.prepare('INSERT INTO carts(id) VALUES(?)').run(id);
  carts.set(id, Date.now());
  return id;
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; if (body.length > 16000) { reject(new Error('Request is too large.')); req.destroy(); } });
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}); } catch { reject(new Error('Invalid request data.')); } });
    req.on('error', reject);
  });
}
function getCart(cartId) {
  const rows = db.prepare(`SELECT p.id AS productId,p.title,p.price,p.category,p.image,ci.quantity FROM cart_items ci JOIN products p ON p.id=ci.product_id WHERE ci.cart_id=? ORDER BY p.id`).all(cartId);
  return { items: rows, total: rows.reduce((sum, item) => sum + item.price * item.quantity, 0) };
}
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  res.setHeader('Access-Control-Allow-Origin', FRONTEND_ORIGIN);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  if (req.method === 'GET' || req.method === 'HEAD') {
    if (url.pathname === '/config.js') {
      const body = 'window.SHOP_API_BASE = "/api";';
      res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      return res.end(req.method === 'HEAD' ? '' : body);
    }
    if (!url.pathname.startsWith('/api/')) {
      let requested;
      try { requested = url.pathname === '/' ? 'index.html' : url.pathname === '/admin' || url.pathname === '/admin/' ? 'admin.html' : decodeURIComponent(url.pathname.slice(1)); }
      catch { res.writeHead(400); return res.end('Bad request'); }
      const filePath = path.resolve(FRONTEND_ROOT, requested);
      if (!filePath.startsWith(FRONTEND_ROOT + path.sep) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(filePath).pipe(res);
    }
  }
  const needsCart = ['/api/cart', '/api/cart/items', '/api/orders'].includes(url.pathname);
  const cartId = needsCart ? getCartId(req) : null;
  try {
    if (req.method === 'GET' && (url.pathname === '/api' || url.pathname === '/api/')) {
      return json(res, 200, {
        name: SHOP_NAME,
        status: 'ok',
        message: 'The API is running. Open the storefront on the frontend port to use the shop.',
        endpoints: ['/api/health', '/api/products', '/api/cart', '/api/orders', '/api/orders/track', '/api/payment-info', '/api/store-info']
      });
    }
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res, 200, { status: 'ok' });
    if (req.method === 'GET' && url.pathname === '/api/payment-info') {
      const qrPath = PAYMENT_QR_IMAGE ? path.resolve(FRONTEND_ROOT, PAYMENT_QR_IMAGE.replace(/^\//, '')) : '';
      const qrImage = qrPath && qrPath.startsWith(FRONTEND_ROOT + path.sep) && fs.existsSync(qrPath) ? PAYMENT_QR_IMAGE : '';
      return json(res, 200, { qrImage, upiId: UPI_ID, upiAvailable: Boolean(qrImage || UPI_ID) });
    }
    if (req.method === 'GET' && url.pathname === '/api/store-info') return json(res, 200, { shopName: SHOP_NAME, legalName: LEGAL_NAME, address: STORE_ADDRESS, phone: CONTACT_PHONE, email: CONTACT_EMAIL, grievanceContact: GRIEVANCE_CONTACT });
    if (req.method === 'POST' && url.pathname === '/api/contact') {
      const body = await readBody(req);
      const name = String(body.name || '').trim(), phone = String(body.phone || '').trim(), email = String(body.email || '').trim(), subject = String(body.subject || '').trim(), message = String(body.message || '').trim();
      if (name.length < 2 || name.length > 80) return json(res, 400, { error: 'Please enter your name (2–80 characters).' });
      if (!/^[0-9+() -]{10,16}$/.test(phone) || phone.replace(/\D/g, '').length < 10) return json(res, 400, { error: 'Please enter a valid phone number.' });
      if (email && (email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) return json(res, 400, { error: 'Please enter a valid email address or leave it blank.' });
      if (subject.length < 2 || subject.length > 80 || message.length < 10 || message.length > 2000) return json(res, 400, { error: 'Choose a topic and enter a message (10–2000 characters).' });
      const saved = db.prepare('INSERT INTO contact_messages(name,phone,email,subject,message) VALUES(?,?,?,?,?)').run(name,phone,email,subject,message);
      return json(res, 201, { ok: true, messageId: Number(saved.lastInsertRowid), message: 'Thanks. Your message has been sent to the shop.' });
    }
    if (req.method === 'GET' && url.pathname === '/api/products') {
      const products = db.prepare('SELECT id,title,description,price,category,image,stock FROM products WHERE active=1 ORDER BY id').all();
      return json(res, 200, { products });
    }
    if (req.method === 'GET' && url.pathname === '/api/orders/track') {
      const orderNumber = String(url.searchParams.get('orderNumber') || '').trim().toUpperCase();
      const phone = String(url.searchParams.get('phone') || '').replace(/\D/g, '');
      if (!orderNumber || phone.length < 10) return json(res, 400, { error: 'Enter your order number and checkout phone number.' });
      const order = mongoDb
        ? await mongoDb.collection('orders').findOne({ orderNumber, phone: { $regex: `^${phone}$` } }, { projection: { _id: 0, orderNumber: 1, status: 1, paymentMethod: 1, paymentStatus: 1, total: 1, createdAt: 1, items: 1 } })
        : (() => {
            const row = db.prepare('SELECT id,order_number AS orderNumber,phone,total,status,payment_method AS paymentMethod,created_at AS createdAt FROM orders WHERE upper(order_number)=?').get(orderNumber);
            if (!row || row.phone.replace(/\D/g, '') !== phone) return null;
            row.items = db.prepare('SELECT title,price,quantity FROM order_items WHERE order_id=?').all(row.id);
            return row;
          })();
      if (!order) return json(res, 404, { error: 'We could not find an order matching those details.' });
      return json(res, 200, { orderNumber: order.orderNumber, status: order.status, paymentMethod: order.paymentMethod, paymentStatus: order.paymentStatus || (order.paymentMethod === 'cod' ? 'pay_on_delivery' : 'verification_pending'), total: order.total, createdAt: order.createdAt, items: order.items.map((item) => ({ title: item.title, quantity: item.quantity })) });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/login') {
      const body = await readBody(req);
      if (!safeEqual(body.username || '', ADMIN_USER) || !safeEqual(body.password || '', ADMIN_PASSWORD)) return json(res, 401, { error: 'Username or password is incorrect.' });
      const token = randomUUID(); adminSessions.set(token, Date.now());
      return json(res, 200, { ok: true }, { 'Set-Cookie': `shop_admin=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800` });
    }
    if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
      const token = (req.headers.cookie || '').match(/(?:^|;\s*)shop_admin=([a-f0-9-]{36})/i)?.[1];
      if (token) adminSessions.delete(token);
      return json(res, 200, { ok: true }, { 'Set-Cookie': 'shop_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' });
    }
    if (url.pathname.startsWith('/api/admin/')) {
      if (!adminOnly(req, res)) return;
      if (req.method === 'GET' && url.pathname === '/api/admin/orders') {
        const orders = mongoDb
          ? await mongoDb.collection('orders').find({}, { projection: { _id: 0 } }).sort({ createdAt: -1 }).limit(200).toArray()
          : db.prepare(`SELECT o.id,o.order_number AS orderNumber,o.customer_name AS customerName,o.phone,o.address,o.total,o.status,o.payment_method AS paymentMethod,o.created_at AS createdAt,(SELECT json_group_array(json_object('productId',oi.product_id,'title',oi.title,'price',oi.price,'quantity',oi.quantity)) FROM order_items oi WHERE oi.order_id=o.id) AS items FROM orders o ORDER BY o.id DESC LIMIT 200`).all().map((order) => ({ ...order, items: JSON.parse(order.items) }));
        return json(res, 200, { orders });
      }
      if (req.method === 'GET' && url.pathname === '/api/admin/messages') {
        const messages = db.prepare('SELECT id,name,phone,email,subject,message,status,created_at AS createdAt FROM contact_messages ORDER BY id DESC LIMIT 200').all();
        return json(res, 200, { messages });
      }
      if (req.method === 'POST' && url.pathname === '/api/admin/products') {
        const body = await readBody(req);
        const title = String(body.title || '').trim(), description = String(body.description || '').trim(), category = String(body.category || '').trim(), image = String(body.image || '').trim();
        const price = Number(body.price), stock = Number(body.stock);
        if (title.length < 2 || title.length > 100 || description.length < 3 || description.length > 500 || category.length < 2 || category.length > 50 || !/^https?:\/\//i.test(image) || image.length > 500 || !Number.isSafeInteger(price) || price < 1 || price > 100000000 || !Number.isSafeInteger(stock) || stock < 0 || stock > 1000000) return json(res, 400, { error: 'Check product fields: valid name, description, category, image URL, whole rupee price and stock are required.' });
        const result = db.prepare('INSERT INTO products(title,description,price,category,image,stock) VALUES(?,?,?,?,?,?)').run(title,description,price,category,image,stock);
        return json(res, 201, { product: db.prepare('SELECT id,title,description,price,category,image,stock FROM products WHERE id=?').get(Number(result.lastInsertRowid)) });
      }
      const productMatch = url.pathname.match(/^\/api\/admin\/products\/(\d+)$/);
      if (req.method === 'PUT' && productMatch) {
        const body = await readBody(req), id = Number(productMatch[1]);
        const title = String(body.title || '').trim(), description = String(body.description || '').trim(), category = String(body.category || '').trim(), image = String(body.image || '').trim();
        const price = Number(body.price), stock = Number(body.stock);
        if (!db.prepare('SELECT id FROM products WHERE id=?').get(id)) return json(res, 404, { error: 'Product not found.' });
        if (title.length < 2 || title.length > 100 || description.length < 3 || description.length > 500 || category.length < 2 || category.length > 50 || !/^https?:\/\//i.test(image) || image.length > 500 || !Number.isSafeInteger(price) || price < 1 || price > 100000000 || !Number.isSafeInteger(stock) || stock < 0 || stock > 1000000) return json(res, 400, { error: 'Check product fields: valid name, description, category, image URL, whole rupee price and stock are required.' });
        db.prepare('UPDATE products SET title=?,description=?,price=?,category=?,image=?,stock=?,active=1 WHERE id=?').run(title,description,price,category,image,stock,id);
        return json(res, 200, { product: db.prepare('SELECT id,title,description,price,category,image,stock FROM products WHERE id=?').get(id) });
      }
      if (req.method === 'DELETE' && productMatch) {
        const id = Number(productMatch[1]);
        if (!db.prepare('SELECT id FROM products WHERE id=? AND active=1').get(id)) return json(res, 404, { error: 'Product not found.' });
        db.prepare('UPDATE products SET active=0 WHERE id=?').run(id);
        return json(res, 200, { ok: true });
      }
      const orderMatch = url.pathname.match(/^\/api\/admin\/orders\/(\d+)$/);
      if (req.method === 'PATCH' && orderMatch) {
        const body = await readBody(req), id = Number(orderMatch[1]), status = String(body.status || '');
        const allowed = ['pending','confirmed','packed','shipped','delivered','cancelled'];
        if (!allowed.includes(status)) return json(res, 400, { error: 'Choose a valid order status.' });
        const current = mongoDb ? await mongoDb.collection('orders').findOne({ id }, { projection: { status: 1, items: 1 } }) : db.prepare('SELECT status FROM orders WHERE id=?').get(id);
        if (!current) return json(res, 404, { error: 'Order not found.' });
        if (current.status === 'cancelled' && status !== 'cancelled') return json(res, 400, { error: 'Cancelled orders cannot be reopened.' });
        if (status === 'cancelled' && current.status !== 'cancelled') {
          if (mongoDb) for (const item of current.items) db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(item.quantity,item.productId);
          else db.prepare('UPDATE products SET stock=stock+(SELECT quantity FROM order_items WHERE order_id=? AND product_id=products.id) WHERE id IN (SELECT product_id FROM order_items WHERE order_id=?)').run(id,id);
        }
        if (mongoDb) await mongoDb.collection('orders').updateOne({ id }, { $set: { status, updatedAt: new Date() } });
        else db.prepare('UPDATE orders SET status=? WHERE id=?').run(status,id);
        return json(res, 200, { ok: true, status });
      }
      return json(res, 404, { error: 'Admin route not found.' });
    }
    if (req.method === 'GET' && url.pathname === '/api/cart') { withCartCookie(res, cartId); return json(res, 200, getCart(cartId)); }
    if (req.method === 'POST' && url.pathname === '/api/cart/items') {
      withCartCookie(res, cartId);
      const body = await readBody(req);
      const productId = Number(body.productId), quantity = Number(body.quantity);
      if (!Number.isSafeInteger(productId) || productId < 1 || !Number.isSafeInteger(quantity) || quantity < 0 || quantity > 20) return json(res, 400, { error: 'Choose a valid product and quantity (0–20).' });
      const product = db.prepare('SELECT id,stock FROM products WHERE id=? AND active=1').get(productId);
      if (!product) return json(res, 404, { error: 'This product is no longer available.' });
      const existing = db.prepare('SELECT quantity FROM cart_items WHERE cart_id=? AND product_id=?').get(cartId, productId);
      if (quantity > (existing?.quantity || 0) + product.stock) return json(res, 400, { error: 'There is not enough stock for that quantity.' });
      quantity === 0
        ? db.prepare('DELETE FROM cart_items WHERE cart_id=? AND product_id=?').run(cartId, productId)
        : db.prepare('INSERT INTO cart_items(cart_id,product_id,quantity) VALUES(?,?,?) ON CONFLICT(cart_id,product_id) DO UPDATE SET quantity=excluded.quantity').run(cartId, productId, quantity);
      return json(res, 200, getCart(cartId));
    }
    if (req.method === 'POST' && url.pathname === '/api/orders') {
      withCartCookie(res, cartId);
      const body = await readBody(req);
      const name = String(body.name || '').trim(), phone = String(body.phone || '').trim(), address = String(body.address || '').trim();
      const paymentMethod = String(body.paymentMethod || 'cod');
      if (!['cod','upi'].includes(paymentMethod)) return json(res, 400, { error: 'Choose Cash on delivery or UPI.' });
      if (paymentMethod === 'upi' && !UPI_ID && !PAYMENT_QR_IMAGE) return json(res, 503, { error: 'UPI payment is not configured yet. Add your QR image or UPI ID in .env.' });
      if (name.length < 2 || name.length > 80) return json(res, 400, { error: 'Enter your name (2–80 characters).' });
      if (!/^[0-9+() -]{10,16}$/.test(phone) || phone.replace(/\D/g, '').length < 10) return json(res, 400, { error: 'Enter a valid phone number with at least 10 digits.' });
      if (address.length < 8 || address.length > 300) return json(res, 400, { error: 'Enter a delivery address (8–300 characters).' });
      const cart = getCart(cartId);
      if (!cart.items.length) return json(res, 400, { error: 'Add a product before placing your order.' });
      for (const item of cart.items) { const product = db.prepare('SELECT stock FROM products WHERE id=? AND active=1').get(item.productId); if (!product || product.stock < item.quantity) return json(res, 400, { error: `Not enough stock for ${item.title}.` }); }
      const orderNumber = `VIP-${Date.now().toString(36).toUpperCase()}-${randomInt(1000,10000)}`;
      const id = Date.now() * 100 + randomInt(0, 100);
      const order = { id, orderNumber, customerName: name, phone, address, total: cart.total, paymentMethod, status: 'pending', paymentStatus: paymentMethod === 'cod' ? 'pay_on_delivery' : 'awaiting_manual_verification', items: cart.items, createdAt: new Date() };
      if (mongoDb) {
        await mongoDb.collection('orders').insertOne(order);
        for (const item of cart.items) db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(item.quantity,item.productId);
        db.prepare('DELETE FROM cart_items WHERE cart_id=?').run(cartId);
      } else {
        try {
          db.exec('BEGIN IMMEDIATE');
          const result = db.prepare('INSERT INTO orders(id,order_number,cart_id,customer_name,phone,address,total,status,payment_method) VALUES(?,?,?,?,?,?,?,?,?)').run(id,orderNumber,cartId,name,phone,address,cart.total,'pending',paymentMethod);
          const addItem = db.prepare('INSERT INTO order_items(order_id,product_id,title,price,quantity) VALUES(?,?,?,?,?)');
          for (const item of cart.items) { addItem.run(id,item.productId,item.title,item.price,item.quantity); db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(item.quantity,item.productId); }
          db.prepare('DELETE FROM cart_items WHERE cart_id=?').run(cartId); db.exec('COMMIT');
        } catch (error) { try { db.exec('ROLLBACK'); } catch {} throw error; }
      }
      return json(res, 201, { orderId: id, orderNumber, total: cart.total, paymentMethod, status: 'pending', paymentStatus: order.paymentStatus });
    }
    return json(res, 404, { error: 'API route not found.' });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) json(res, error.message === 'Invalid request data.' ? 400 : 500, { error: error.message === 'Invalid request data.' ? error.message : 'The server could not complete that request.' });
  }
});
async function startServer() {
  if (process.env.NODE_ENV === 'production' && !ADMIN_PASSWORD) {
    console.error('Set ADMIN_PASSWORD before starting the production server.');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production' && !MONGODB_URI) {
    console.error('Set MONGODB_URI before starting the production server so orders are stored persistently.');
    process.exit(1);
  }
  if (process.env.NODE_ENV === 'production' && isLocalMongoUri(MONGODB_URI)) {
    console.error('MONGODB_URI points to localhost, which is inside the Render container. Set it to your MongoDB Atlas connection string in the Render Environment settings, then redeploy.');
    process.exit(1);
  }
  if (mongoClient) {
    try { await mongoClient.connect(); mongoDb = mongoClient.db(MONGODB_DB); await mongoDb.command({ ping: 1 }); console.log(`MongoDB connected (${MONGODB_DB})`); }
    catch (error) {
      console.error(`MongoDB connection failed: ${error.message}`);
      if (process.env.NODE_ENV === 'production') process.exit(1);
    }
  } else console.warn('MongoDB is not configured. Orders will use local SQLite until MONGODB_URI is set in .env.');
  server.listen(PORT, '0.0.0.0', () => console.log(`My Shop VIP running at http://localhost:${PORT}`));
}
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`Backend port ${PORT} is already in use. Reusing the API at http://localhost:${PORT}.`);
    if (mongoClient) mongoClient.close().finally(() => process.exit(0));
    else process.exit(0);
    return;
  }
  console.error(`Backend server failed: ${error.message}`);
  process.exitCode = 1;
});
startServer();

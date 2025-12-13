// server.js — unified server (site + stripe + admin)
require('dotenv').config();

const path = require('path');
const express = require('express');
const bodyParser = require('body-parser'); // used for webhook raw
const fs = require('fs-extra');
const cors = require('cors');
const nodemailer = require('nodemailer');
const multer = require('multer');
const session = require('express-session');

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const stripe = STRIPE_KEY ? require('stripe')(STRIPE_KEY) : null;

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Paths
const SITE_DIR = path.join(__dirname, 'sliceofukraine.ca');
const CATALOG_PATH = path.join(SITE_DIR, 'catalog.json');
const UPLOADS_DIR = path.join(SITE_DIR, 'img', 'uploads');

// Ensure uploads dir exists
fs.ensureDirSync(UPLOADS_DIR);

// Multer storage
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOADS_DIR),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname) || '';
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  }
});
const upload = multer({ storage });

// Simple in-memory order tracking for Stripe sessions
const pendingOrders = new Map();
const completedOrders = new Map();

// --- Middleware ---
// CORS: allow credentials (cookies) — in production set specific origin
app.use(cors({ origin: true, credentials: true }));
// JSON + URL-encoded for normal routes (webhook handled separately)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Sessions (used for admin auth)
app.use(session({
  secret: process.env.SESSION_SECRET || 'slice-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {

    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

// Serve static site
app.use(express.static(SITE_DIR));
// Serve uploaded images at /img/uploads
app.use('/img/uploads', express.static(UPLOADS_DIR));

// ---- Helper functions for catalog ----
async function readCatalog() {
  try {
    const raw = await fs.readFile(CATALOG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.warn('Could not read catalog.json — returning empty array', e.message);
    return [];
  }
}
async function writeCatalog(arr) {
  await fs.writeFile(CATALOG_PATH, JSON.stringify(arr, null, 2), 'utf8');
}

function toNumber(val) {
  if (typeof val === 'number' && Number.isFinite(val)) return val;
  const num = parseFloat(String(val || '').replace(/[^0-9.,-]+/g, '').replace(',', '.'));
  return Number.isFinite(num) ? num : 0;
}

function formatCurrency(amount, currencyCode) {
  const code = (currencyCode || process.env.STRIPE_CURRENCY || 'CAD').toUpperCase();
  const value = Number(amount) || 0;
  return `${value.toFixed(2)} ${code}`;
}

function htmlEscape(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildItemsTable(items, currency) {
  if (!Array.isArray(items) || !items.length) return '<p>Кошик порожній</p>';
  const rows = items
    .map((item, idx) => {
      const qty = Number(item.quantity) || 1;
      const price = Number(item.price) || 0;
      const lineTotal = price * qty;
      return `
        <tr>
          <td style="padding:6px;border:1px solid #ddd;text-align:center">${idx + 1}</td>
          <td style="padding:6px;border:1px solid #ddd">${htmlEscape(item.name || 'Product')}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:center">${qty}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right">${formatCurrency(price, currency)}</td>
          <td style="padding:6px;border:1px solid #ddd;text-align:right">${formatCurrency(lineTotal, currency)}</td>
        </tr>
      `;
    })
    .join('');
  return `
    <table style="border-collapse:collapse;width:100%;margin-top:10px">
      <thead>
        <tr>
          <th style="padding:6px;border:1px solid #ddd">#</th>
          <th style="padding:6px;border:1px solid #ddd;text-align:left">Товар</th>
          <th style="padding:6px;border:1px solid #ddd;text-align:center">К-сть</th>
          <th style="padding:6px;border:1px solid #ddd;text-align:right">Ціна</th>
          <th style="padding:6px;border:1px solid #ddd;text-align:right">Разом</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function normalizeStripeLineItems(lineItems) {
  if (!Array.isArray(lineItems)) return [];
  return lineItems
    .map((li) => {
      const qty = Number(li?.quantity) || 1;
      const totalCents =
        typeof li?.amount_total === 'number'
          ? li.amount_total
          : typeof li?.amount_subtotal === 'number'
          ? li.amount_subtotal
          : Number(li?.price?.unit_amount) * qty || 0;
      const total = totalCents / 100;
      const unitPrice = qty ? total / qty : total;
      return {
        name: li?.description || li?.price?.nickname || 'Product',
        quantity: qty,
        price: unitPrice,
      };
    })
    .filter((item) => item.price > 0 && item.quantity > 0);
}

async function sendOrderEmail(order, sessionId) {
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;
  if (!user || !pass) throw new Error('Email credentials are not configured');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass }
  });

  const currency = (order && order.currency) || process.env.STRIPE_CURRENCY || 'CAD';
  const itemsHtml = buildItemsTable(order?.items, currency);
  const totalText = formatCurrency(order?.total, currency);

  const html = `
    <div style="font-family: Arial; padding:20px;">
      <h2>Нове замовлення — Slice of Ukraine</h2>
      ${sessionId ? `<p><b>Stripe Session:</b> ${htmlEscape(sessionId)}</p>` : ''}
      <p><b>Ім'я:</b> ${htmlEscape(order?.customer?.name || '')}</p>
      <p><b>Email:</b> ${htmlEscape(order?.customer?.email || '')}</p>
      <p><b>Адреса:</b> ${htmlEscape(order?.customer?.address || '')}</p>
      ${itemsHtml}
      <p style="font-size:16px;margin-top:10px;"><b>Сума:</b> ${totalText}</p>
    </div>
  `;

  await transporter.sendMail({
    from: user,
    to: process.env.EMAIL_RECEIVER || user,
    subject: `Нове замовлення від ${order?.customer?.name || 'клієнта'}`,
    html
  });
}

// ---- Public routes (site) ----
app.get('/', (req, res) => {
  res.sendFile(path.join(SITE_DIR, 'index.html'));
});
app.get('/health', (req, res) => res.json({ ok: true }));

// ---- STRIPE: create checkout session ----
app.post('/create-checkout-session', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  try {
    const { items, customer } = req.body || {};
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    const stripeCurrencySetting = (process.env.STRIPE_CURRENCY || 'cad');
    const stripeCurrency = stripeCurrencySetting.toLowerCase();
    const displayCurrency = stripeCurrencySetting.toUpperCase();
    const normalizedItems = [];

    const lineItems = items
      .map(item => {
        const name = (item && item.name ? String(item.name) : 'Item').slice(0, 127);
        const price = toNumber(item && (item.price ?? item.amount));
        const quantity = Number.isFinite(Number(item && item.quantity))
          ? Math.max(1, parseInt(item.quantity, 10) || 1)
          : 1;
        if (!Number.isFinite(price) || price <= 0) return null;
        normalizedItems.push({ name, price, quantity });
        return {
          price_data: {
            currency: stripeCurrency,
            product_data: { name },
            unit_amount: Math.round(price * 100),
          },
          quantity,
        };
      })
      .filter(Boolean);

    if (!lineItems.length) {
      return res.status(400).json({ error: 'Invalid line items' });
    }

    const origin = req.get('origin') || `http://localhost:${PORT}`;
    const successUrl =
      process.env.SUCCESS_URL || `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = process.env.CANCEL_URL || `${origin}/cancel.html`;
    const successWithSession = successUrl.includes('{CHECKOUT_SESSION_ID}')
      ? successUrl
      : `${successUrl}?session_id={CHECKOUT_SESSION_ID}`;

    const customerEmail = customer?.email ? String(customer.email).trim() : undefined;
    const metadata = {};
    if (customer?.name) metadata.customer_name = String(customer.name).trim().slice(0, 500);
    if (customer?.address) metadata.customer_address = String(customer.address).trim().slice(0, 500);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      success_url: successWithSession,
      cancel_url: cancelUrl,
      customer_email: customerEmail || undefined,
      metadata: Object.keys(metadata).length ? metadata : undefined,
    });

    if (normalizedItems.length) {
      const orderTotal = normalizedItems.reduce(
        (sum, item) => sum + item.price * item.quantity,
        0
      );
      pendingOrders.set(session.id, {
        customer: {
          name: (customer?.name || '').trim(),
          email: customerEmail || '',
          address: (customer?.address || '').trim(),
        },
        items: normalizedItems,
        currency: displayCurrency,
        total: orderTotal,
        createdAt: Date.now(),
      });
    }

    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    res.status(500).json({ error: err.message || 'Stripe error' });
  }
});

// ---- STRIPE webhook (raw body) ----
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!stripe || !webhookSecret) {
    console.warn('Webhook called but not configured');
    return res.status(400).send('Webhook not configured');
  }

  try {
    const sig = req.headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);

    if (event.type === 'checkout.session.completed') {
      console.log('Checkout completed:', event.data.object.id);
      // optionally handle post-payment logic here
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

// ---- Confirm order after successful Stripe checkout ----
app.post('/order/confirm', async (req, res) => {
  if (!stripe) return res.status(500).json({ success: false, error: 'Stripe not configured' });
  const { session_id: sessionId } = req.body || {};
  if (!sessionId) {
    return res.status(400).json({ success: false, error: 'session_id is required' });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' });
    }
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ success: false, error: 'Payment not completed yet' });
    }

    let orderData = completedOrders.get(sessionId) || pendingOrders.get(sessionId);
    if (!orderData) {
      const lineItemsResp = await stripe.checkout.sessions.listLineItems(sessionId, { limit: 100 });
      const normalized = normalizeStripeLineItems(lineItemsResp?.data || []);
      orderData = {
        customer: {
          name:
            session.metadata?.customer_name ||
            session.customer_details?.name ||
            '',
          email:
            session.customer_details?.email ||
            session.customer_email ||
            '',
          address:
            session.metadata?.customer_address ||
            session.customer_details?.address?.line1 ||
            '',
        },
        items: normalized,
        currency: (session.currency || process.env.STRIPE_CURRENCY || 'CAD').toUpperCase(),
        total:
          typeof session.amount_total === 'number'
            ? session.amount_total / 100
            : normalized.reduce((sum, item) => sum + item.price * item.quantity, 0),
      };
    } else {
      orderData = {
        ...orderData,
        customer: {
          name:
            orderData.customer?.name ||
            session.metadata?.customer_name ||
            session.customer_details?.name ||
            '',
          email:
            orderData.customer?.email ||
            session.customer_details?.email ||
            session.customer_email ||
            '',
          address:
            orderData.customer?.address ||
            session.metadata?.customer_address ||
            session.customer_details?.address?.line1 ||
            '',
        },
        currency: (session.currency || orderData.currency || process.env.STRIPE_CURRENCY || 'CAD').toUpperCase(),
        total:
          typeof session.amount_total === 'number'
            ? session.amount_total / 100
            : orderData.total,
      };
    }

    if (!completedOrders.has(sessionId)) {
      await sendOrderEmail(orderData, sessionId);
      completedOrders.set(sessionId, orderData);
      pendingOrders.delete(sessionId);
    }

    res.json({ success: true, order: completedOrders.get(sessionId) || orderData });
  } catch (err) {
    console.error('Order confirm error:', err);
    res.status(500).json({ success: false, error: err.message || 'Order confirmation failed' });
  }
});

// ---- EMAIL order endpoint ----
app.post('/order', async (req, res) => {
  const { name, address, email, cart, total } = req.body || {};

  if (!name || !email || !cart) {
    return res.status(400).json({ success: false, error: 'Invalid input' });
  }

  let parsedCart = [];
  try {
    parsedCart =
      typeof cart === 'string'
        ? JSON.parse(cart)
        : Array.isArray(cart)
        ? cart
        : [];
  } catch {
    parsedCart = [];
  }

  const normalized = (Array.isArray(parsedCart) ? parsedCart : [])
    .map((item) => {
      const qty = Number(item?.qty || item?.quantity || 1) || 1;
      const price = toNumber(item?.price || item?.amount || 0);
      const name = item?.title || item?.name || 'Product';
      if (!qty || !price) return null;
      return { name, quantity: qty, price };
    })
    .filter(Boolean);

  if (!normalized.length && total) {
    normalized.push({
      name: 'Order total',
      quantity: 1,
      price: toNumber(total),
    });
  }

  const orderData = {
    customer: { name, address, email },
    items: normalized,
    currency: (process.env.STRIPE_CURRENCY || 'CAD').toUpperCase(),
    total: normalized.reduce((sum, item) => sum + item.price * item.quantity, 0),
  };

  try {
    await sendOrderEmail(orderData, 'manual');
    res.json({ success: true });
  } catch (err) {
    console.error('Mail error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- ADMIN AUTH & API ----
function requireAuth(req, res, next) {
  if (req.session && req.session.admin) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.post('/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password === process.env.ADMIN_PASS) {
    req.session.admin = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Wrong password' });
});

app.post('/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

// Products API
app.get('/api/products', async (req, res) => {
  const arr = await readCatalog();
  res.json(arr);
});

app.get('/api/products/:id', async (req, res) => {
  const id = Number(req.params.id);
  const arr = await readCatalog();
  const p = arr.find(x => Number(x.id) === id);
  if (!p) return res.status(404).json({ error: 'Not found' });
  res.json(p);
});

// Create product
app.post('/api/products', requireAuth, upload.single('image'), async (req, res) => {
  const arr = await readCatalog();
  const body = req.body || {};

  const newId = arr.length ? Math.max(...arr.map(x => Number(x.id))) + 1 : 1;
  const imgPath = req.file ? `/img/uploads/${req.file.filename}` : (body.img || '');

  const product = {
    id: newId,
    title_uk: body.title_uk || '',
    title_en: body.title_en || '',
    price: body.price ? String(body.price) : '0',
    discount: body.discount ? String(body.discount) : '',
    img: imgPath,
    desc_uk: body.desc_uk || '',
    desc_en: body.desc_en || '',
    category: body.category || ''
  };

  arr.push(product);
  await writeCatalog(arr);
  res.json(product);
});

// Update product
app.put('/api/products/:id', requireAuth, upload.single('image'), async (req, res) => {
  const id = Number(req.params.id);
  const arr = await readCatalog();
  const idx = arr.findIndex(x => Number(x.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const body = req.body || {};
  const p = arr[idx];

  // new uploaded file? replace
  if (req.file) {
    // delete previous local upload if it was local
    if (p.img && String(p.img).startsWith('/img/uploads/')) {
      const relative = p.img.replace(/^\/+/, ''); // remove leading slash
      try { await fs.remove(path.join(SITE_DIR, relative)); } catch (e) { /* ignore */ }
    }
    p.img = `/img/uploads/${req.file.filename}`;
  } else if (body.img) {
    p.img = body.img;
  }

  p.title_uk = body.title_uk ?? p.title_uk;
  p.title_en = body.title_en ?? p.title_en;
  p.price = body.price !== undefined ? String(body.price) : p.price;
  p.discount = body.discount !== undefined ? String(body.discount) : (p.discount || '');
  p.desc_uk = body.desc_uk ?? p.desc_uk;
  p.desc_en = body.desc_en ?? p.desc_en;
  p.category = body.category ?? p.category;

  arr[idx] = p;
  await writeCatalog(arr);
  res.json(p);
});

// Delete product
app.delete('/api/products/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const arr = await readCatalog();
  const idx = arr.findIndex(x => Number(x.id) === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const removed = arr.splice(idx, 1)[0];

  // delete local image if in uploads
  if (removed.img && String(removed.img).startsWith('/img/uploads/')) {
    const relative = removed.img.replace(/^\/+/, '');
    try { await fs.remove(path.join(SITE_DIR, relative)); } catch (e) { /* ignore */ }
  }

  await writeCatalog(arr);
  res.json({ ok: true });
});

// Upload-only endpoint (optional)
app.post('/api/upload', requireAuth, upload.single('image'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'no file' });
  const url = `/img/uploads/${req.file.filename}`;
  res.json({ url });
});

// Start server
app.listen(PORT, () => {
  console.log(`Unified server running on port ${PORT}`);
  console.log(`Serving site from ${SITE_DIR}`);
});

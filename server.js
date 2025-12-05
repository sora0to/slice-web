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
    // secure should be true in production with HTTPS
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

// ---- Public routes (site) ----
app.get('/', (req, res) => {
  res.sendFile(path.join(SITE_DIR, 'index.html'));
});
app.get('/health', (req, res) => res.json({ ok: true }));

// ---- STRIPE: create checkout session ----
app.post('/create-checkout-session', async (req, res) => {
  if (!stripe) return res.status(500).json({ error: 'Stripe not configured' });

  try {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'No items provided' });
    }

    const lineItems = items.map(item => ({
      price_data: {
        currency: process.env.STRIPE_CURRENCY || 'cad',
        product_data: { name: item.name },
        unit_amount: Math.round(Number(item.price) * 100),
      },
      quantity: item.quantity || 1
    }));

    const origin = req.get('origin') || `http://localhost:${PORT}`;
    const successUrl = process.env.SUCCESS_URL || `${origin}/success.html`;
    const cancelUrl = process.env.CANCEL_URL || `${origin}/cancel.html`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl
    });

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

// ---- EMAIL order endpoint ----
app.post('/order', async (req, res) => {
  const { name, address, email, cart, total } = req.body || {};

  if (!name || !email || !cart || !total) {
    return res.status(400).json({ success: false, error: 'Invalid input' });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const html = `
    <div style="font-family: Arial; padding:20px;">
      <h2>Нове замовлення — Slice of Ukraine</h2>
      <p><b>Ім'я:</b> ${name}</p>
      <p><b>Email:</b> ${email}</p>
      <p><b>Адреса:</b> ${address}</p>
      <h3>Кошик:</h3>
      <pre style="background:#f5f5f5;padding:10px;border-radius:6px;">
${JSON.stringify(cart, null, 2)}
      </pre>
      <p><b>Сума:</b> ${total}</p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.EMAIL_RECEIVER || process.env.EMAIL_USER,
      subject: `Нове замовлення від ${name}`,
      html
    });

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

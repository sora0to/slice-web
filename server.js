require("dotenv").config();
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const nodemailer = require("nodemailer");
const stripeKey = process.env.STRIPE_SECRET_KEY || "";
const stripe = stripeKey ? require("stripe")(stripeKey) : null;
const app = express();

// Serve frontend static files (sliceofukraine.ca folder)
app.use(express.static(path.join(__dirname, "sliceofukraine.ca")));

// Serve frontend static files (sliceofukraine.ca folder)
app.use(express.static(path.join(__dirname, "sliceofukraine.ca")));

// Serve index.html on root URL
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "sliceofukraine.ca", "index.html"));
});

// JSON parsing for normal routes
app.use(cors());
app.use(express.json());

// Health
app.get("/health", (req, res) => res.json({ ok: true }));

// Create a Stripe Checkout Session
app.post("/create-checkout-session", async (req, res) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: "No items provided" });
    }

    const lineItems = items.map((item) => ({
      price_data: {
        currency: "cad", // 👈 можно поменять на 'usd' или 'cad'
        product_data: {
          name: item.name || "Unnamed Product",
        },
        unit_amount: Math.round(Number(item.price) * 100), // Stripe требует копейки
      },
      quantity: item.quantity || 1,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: lineItems,
      locale: "en", // можно поменять на 'uk' для украинского
      success_url: "http://localhost:3000/success.html",
      cancel_url: "http://localhost:3000/cancel.html",
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Error creating checkout:", err);
    res.status(500).json({ error: err.message });
  }
});

// Stripe webhook (raw body required)
app.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
    if (!stripe || !webhookSecret) {
      console.warn(
        "Webhook received but stripe or webhook secret not configured."
      );
      return res.status(400).send("Webhook not configured");
    }
    const sig = req.headers["stripe-signature"];
    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed.", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    console.log("Received webhook:", event.type);
    // Handle events we care about
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      console.log("Checkout completed for session:", session.id);
      // TODO: fulfill order, send email, etc.
    }
    res.json({ received: true });
  }
);

// Simple order endpoint (keeps existing functionality to send email)
app.post('/order', async (req, res) => {
  const { name, address, email, cart, total } = req.body;

  if (!name || !address || !email || !cart || !total) {
    return res.status(400).json({ success: false, error: "Invalid request data" });
  }

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    }
  });

  const htmlContent = `
  <div style="font-family: Arial, sans-serif; background: #f6f6f6; padding: 20px;">
    <div style="
      max-width: 600px;
      background: #ffffff;
      margin: 0 auto;
      padding: 25px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
    ">
      <h2 style="color: #333; text-align: center;">🥟 Нове замовлення — Slice of Ukraine</h2>

      <h3>🧍 Інформація про клієнта</h3>
      <p><strong>Ім'я:</strong> ${name}</p>
      <p><strong>Email:</strong> ${email}</p>
      <p><strong>Адреса:</strong> ${address}</p>

      <h3>🛒 Кошик:</h3>
      <pre style="background:#fafafa;padding:12px;border-radius:8px;">${cart}</pre>

      <h3>💰 Сума: <span style="font-size:20px;">${total}</span></h3>

      <p style="text-align:center;margin-top:25px;color:#777;">
        — Це повідомлення створене автоматично —
      </p>
    </div>
  </div>
  `;

  const message = {
    from: process.env.EMAIL_USER,
    to: process.env.EMAIL_RECEIVER || process.env.EMAIL_USER,
    subject: `Нове замовлення від ${name}`,
    html: htmlContent,
    text: `Ім'я: ${name}\nEmail: ${email}\nАдреса: ${address}\nСума: ${total}\nКошик: ${cart}`,
  };

  try {
    await transporter.sendMail(message);
    res.json({ success: true });
  } catch (err) {
    console.error("Nodemailer error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


const PORT = parseInt(process.env.PORT || "3000");
app.listen(PORT, () =>
  console.log(
    `Server started on port ${PORT}. Open http://localhost:${PORT}/ to open the site.`
  )
);


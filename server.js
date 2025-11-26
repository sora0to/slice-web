require("dotenv").config();
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const nodemailer = require("nodemailer");

const stripeKey = process.env.STRIPE_SECRET_KEY || "";
const stripe = stripeKey ? require("stripe")(stripeKey) : null;

const app = express();

///////////////////////////////////////////////////////////////////////////////
// 1) STRIPE CHECK (не ломаем сервер, просто предупреждаем)
///////////////////////////////////////////////////////////////////////////////
if (!stripe) {
  console.warn("⚠ Stripe is NOT configured. Payments will NOT work.");
}

///////////////////////////////////////////////////////////////////////////////
// 2) STATIC FILES (фронтенд)
///////////////////////////////////////////////////////////////////////////////
app.use(express.static(path.join(__dirname, "sliceofukraine.ca")));

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "sliceofukraine.ca", "index.html"));
});

///////////////////////////////////////////////////////////////////////////////
// 3) STRIPE WEBHOOK — ДОЛЖЕН БЫТЬ ДО express.json()
///////////////////////////////////////////////////////////////////////////////
app.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";

    if (!stripe || !webhookSecret) {
      console.warn("Webhook received, but Stripe is not configured.");
      return res.status(400).send("Stripe webhook not configured");
    }

    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
      console.error("Webhook signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    console.log("⚡ Webhook received:", event.type);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      console.log("💰 Checkout completed:", session.id);

      // Place for automatic email / DB save if needed
    }

    res.json({ received: true });
  }
);

///////////////////////////////////////////////////////////////////////////////
// 4) NORMAL JSON PARSER — ПОСЛЕ ВЕБХУКА
///////////////////////////////////////////////////////////////////////////////
app.use(cors());
app.use(express.json());

///////////////////////////////////////////////////////////////////////////////
// 5) HEALTH CHECK
///////////////////////////////////////////////////////////////////////////////
app.get("/health", (req, res) => res.json({ ok: true }));

///////////////////////////////////////////////////////////////////////////////
// 6) STRIPE CHECKOUT SESSION
///////////////////////////////////////////////////////////////////////////////
app.post("/create-checkout-session", async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: "Stripe is not configured" });
  }

  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No items provided" });
    }

    const lineItems = items.map((item) => ({
      price_data: {
        currency: "cad",
        product_data: {
          name: item.name || "Product",
        },
        unit_amount: Math.round(Number(item.price) * 100),
      },
      quantity: item.quantity || 1,
    }));

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: lineItems,
      locale: "en",
      success_url: "https://sliceofukraine.ca/success.html",
      cancel_url: "https://sliceofukraine.ca/cancel.html",
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ error: err.message });
  }
});

///////////////////////////////////////////////////////////////////////////////
// 7) EMAIL ORDER NOTIFICATION (Nodemailer)
///////////////////////////////////////////////////////////////////////////////
app.post("/order", async (req, res) => {
  const { name, address, email, cart, total } = req.body;

  if (!name || !address || !email || !cart || !total) {
    return res
      .status(400)
      .json({ success: false, error: "Invalid request data" });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
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
      <pre style="background:#fafafa;padding:12px;border-radius:8px;">
${JSON.stringify(cart, null, 2)}
      </pre>

      <h3>💰 Сума: <span style="font-size:20px;">${total} CAD</span></h3>

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
  };

  try {
    await transporter.sendMail(message);
    res.json({ success: true });
  } catch (err) {
    console.error("Nodemailer error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

///////////////////////////////////////////////////////////////////////////////
// 8) START SERVER
///////////////////////////////////////////////////////////////////////////////
const PORT = parseInt(process.env.PORT || "3000");
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);

require("dotenv").config();
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const cors = require("cors");
const nodemailer = require("nodemailer");

const stripeKey = process.env.STRIPE_SECRET_KEY || "";
const stripe = stripeKey ? require("stripe")(stripeKey) : null;

const app = express();

// Static frontend folder
app.use(express.static(path.join(__dirname, "sliceofukraine.ca")));

app.use(cors());
app.use(express.json());

// Root route
app.get("/", (req, res) =>
  res.sendFile(path.join(__dirname, "sliceofukraine.ca", "index.html"))
);

// Health check
app.get("/health", (req, res) => res.json({ ok: true }));


// #######################################################
//   STRIPE CHECKOUT
// #######################################################
app.post("/create-checkout-session", async (req, res) => {
  if (!stripe) {
    return res.status(500).json({ error: "Stripe not configured" });
  }

  try {
    const { items } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "No items provided" });
    }

    const lineItems = items.map((item) => ({
      price_data: {
        currency: process.env.STRIPE_CURRENCY || "cad",
        product_data: { name: item.name },
        unit_amount: Math.round(Number(item.price) * 100),
      },
      quantity: item.quantity || 1,
    }));

    const origin = req.get("origin") || `http://localhost:${process.env.PORT}`;
    const successUrl = process.env.SUCCESS_URL || `${origin}/success.html`;
    const cancelUrl = process.env.CANCEL_URL || `${origin}/cancel.html`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      mode: "payment",
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe error:", err);
    res.status(500).json({ error: err.message });
  }
});


// #######################################################
//   STRIPE WEBHOOK
// #######################################################
app.post(
  "/webhook",
  bodyParser.raw({ type: "application/json" }),
  (req, res) => {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (!stripe || !webhookSecret) {
      console.warn("Webhook called but not configured");
      return res.status(400).send("Webhook not configured");
    }

    try {
      const event = stripe.webhooks.constructEvent(
        req.body,
        req.headers["stripe-signature"],
        webhookSecret
      );

      if (event.type === "checkout.session.completed") {
        console.log("Stripe checkout completed:", event.data.object.id);
      }

      res.json({ received: true });
    } catch (err) {
      console.error("Webhook signature error:", err);
      res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);


// #######################################################
//   EMAIL ORDER
// #######################################################
app.post("/order", async (req, res) => {
  const { name, address, email, cart, total } = req.body || {};

  if (!name || !address || !email || !cart || !total) {
    return res.status(400).json({ success: false, error: "Invalid input" });
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER, // Gmail
      pass: process.env.EMAIL_PASS, // App password
    },
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
      html,
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Mail error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


// Start server
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

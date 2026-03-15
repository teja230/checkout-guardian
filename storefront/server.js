const express = require("express");
const path = require("path");

const app = express();
const PORT = parseInt(process.env.PORT || "3002");

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Product page — entry point. ?bugs=bug1,bug2 activates bugs for the session.
app.get("/", (req, res) => {
  res.render("product", { bugs: req.query.bugs || "" });
});

app.get("/cart", (req, res) => {
  res.render("cart");
});

app.get("/shipping", (req, res) => {
  res.render("shipping");
});

app.get("/payment", (req, res) => {
  res.render("payment");
});

app.get("/review", (req, res) => {
  res.render("review");
});

app.get("/confirmation", (req, res) => {
  res.render("confirmation");
});

app.get("/error", (req, res) => {
  res.render("error");
});

// Fake API endpoints that the checkout pages call via fetch()
// These simulate backend behavior and inject bugs when active.

app.post("/api/cart/add", (req, res) => {
  res.json({ success: true, item: "Wireless Bluetooth Headphones", price: 79.99, qty: 1 });
});

app.post("/api/cart/promo", (req, res) => {
  const { code } = req.body;
  if (code === "SAVE20") {
    res.json({ success: true, discount: 0.2, label: "SAVE20 — 20% off" });
  } else {
    res.json({ success: false, message: "Invalid promo code" });
  }
});

app.post("/api/address/validate", (req, res) => {
  const { zip, activeBugs } = req.body;
  const bugs = (activeBugs || "").split(",");

  if (bugs.includes("zip_leading_zero")) {
    // Bug: parseInt strips leading zero, then length check fails
    const parsed = parseInt(zip, 10);
    if (String(parsed).length !== 5) {
      return res.status(422).json({
        error: "invalid_zip",
        message: `ZIP must be 5 digits, got ${String(parsed).length}`,
      });
    }
  }

  res.json({ success: true });
});

app.post("/api/inventory/reserve", (req, res) => {
  const { activeBugs } = req.body;
  const bugs = (activeBugs || "").split(",");

  if (bugs.includes("inventory_stale_cache")) {
    return res.status(409).json({
      error: "insufficient_stock",
      message: "Item is out of stock",
      requested: 1,
      available: 0,
      sku: "MECH-KB-001",
    });
  }

  res.json({ success: true, reserved: true });
});

app.post("/api/payments/charge", (req, res) => {
  const { activeBugs } = req.body;
  const bugs = (activeBugs || "").split(",");

  if (bugs.includes("payment_504")) {
    // Simulate gateway timeout — delay then 504
    return setTimeout(() => {
      res.status(504).json({ error: "gateway_timeout" });
    }, 5000);
  }

  res.json({ success: true, orderId: "ORD-" + Date.now() });
});

app.listen(PORT, () => {
  console.log(`Demo storefront running on http://localhost:${PORT}`);
  console.log("Pass ?bugs=bug1,bug2 to activate seeded bugs");
});

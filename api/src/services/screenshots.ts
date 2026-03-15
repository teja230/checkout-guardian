import fs from "fs";
import path from "path";

const ARTIFACTS_DIR = path.resolve(__dirname, "../../../artifacts/screenshots");

export interface ScreenshotContext {
  runId: string;
  stepIndex: number;
  stepName: string;
  action: string;
  status: "running" | "passed" | "failed";
  scenarioId: string;
  failureDetail?: string;
}

export async function captureScreenshot(ctx: ScreenshotContext): Promise<string> {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }

  const filename = `${ctx.runId}_step${ctx.stepIndex}.svg`;
  const filePath = path.join(ARTIFACTS_DIR, filename);
  const svg = renderPage(ctx);
  fs.writeFileSync(filePath, svg);
  return filename;
}

function esc(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Determine which page to render based on step name/action
function renderPage(ctx: ScreenshotContext): string {
  const name = ctx.stepName.toLowerCase();
  const isFailed = ctx.status === "failed";

  if (name.includes("add item") || name.includes("add to cart") || name.includes("add") && name.includes("cart")) {
    return productPage(ctx);
  }
  if (name.includes("open cart") || (name.includes("cart") && !name.includes("add"))) {
    return cartPage(ctx);
  }
  if (name.includes("promo") || name.includes("coupon")) {
    return promoCodePage(ctx);
  }
  if (name.includes("proceed to checkout")) {
    return cartPage(ctx, true);
  }
  if (name.includes("shipping address") || name.includes("fill shipping") || name.includes("fill address")) {
    return shippingAddressPage(ctx);
  }
  if (name.includes("submit shipping") || name.includes("shipping form")) {
    return shippingAddressPage(ctx, true);
  }
  if (name.includes("shipping method") || name.includes("select shipping") || name.includes("pickup") || name.includes("delivery")) {
    return shippingMethodPage(ctx);
  }
  if (name.includes("payment") || name.includes("card")) {
    return paymentPage(ctx);
  }
  if (name.includes("verify") && name.includes("discount")) {
    return reviewPage(ctx, "discount");
  }
  if (name.includes("verify") && (name.includes("shipping") || name.includes("fee"))) {
    return reviewPage(ctx, "shipping");
  }
  if (name.includes("review")) {
    return reviewPage(ctx);
  }
  if (name.includes("place order")) {
    if (isFailed) return orderErrorPage(ctx);
    if (ctx.status === "running") return reviewPage(ctx);
    return orderConfirmPage(ctx);
  }
  // Fallback
  return checkoutGenericPage(ctx);
}

// ─── Shared chrome ───────────────────────────────────────────────────
function browserChrome(url: string): string {
  return `
  <rect width="1280" height="44" fill="#1e293b"/>
  <circle cx="20" cy="22" r="6" fill="#ef4444" opacity="0.8"/>
  <circle cx="38" cy="22" r="6" fill="#eab308" opacity="0.8"/>
  <circle cx="56" cy="22" r="6" fill="#22c55e" opacity="0.8"/>
  <rect x="80" y="10" width="500" height="24" rx="12" fill="#334155"/>
  <text x="96" y="27" font-family="system-ui,sans-serif" font-size="11" fill="#94a3b8">${esc(url)}</text>
  <rect x="1200" y="12" width="20" height="20" rx="3" fill="#334155"/>
  <rect x="1226" y="12" width="20" height="20" rx="3" fill="#334155"/>`;
}

function storeHeader(): string {
  return `
  <rect x="0" y="44" width="1280" height="48" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>
  <text x="40" y="75" font-family="system-ui,sans-serif" font-size="20" fill="#1e293b" font-weight="700">DemoStore</text>
  <text x="200" y="75" font-family="system-ui,sans-serif" font-size="13" fill="#64748b">Shop</text>
  <text x="260" y="75" font-family="system-ui,sans-serif" font-size="13" fill="#64748b">Deals</text>
  <text x="320" y="75" font-family="system-ui,sans-serif" font-size="13" fill="#64748b">Support</text>
  <!-- Search bar -->
  <rect x="500" y="58" width="400" height="32" rx="4" fill="#f1f5f9" stroke="#e2e8f0"/>
  <text x="516" y="79" font-family="system-ui,sans-serif" font-size="12" fill="#94a3b8">Search products...</text>
  <!-- Cart icon -->
  <rect x="1160" y="58" width="80" height="32" rx="4" fill="#f1f5f9" stroke="#e2e8f0"/>
  <text x="1175" y="79" font-family="system-ui,sans-serif" font-size="12" fill="#475569">Cart (1)</text>`;
}

function checkoutProgress(active: number): string {
  const steps = ["Cart", "Shipping", "Payment", "Review"];
  let svg = `<rect x="0" y="92" width="1280" height="40" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>`;
  const startX = 360;
  const gap = 180;
  for (let i = 0; i < steps.length; i++) {
    const x = startX + i * gap;
    const isActive = i === active;
    const isDone = i < active;
    const circleColor = isActive ? "#3b82f6" : isDone ? "#22c55e" : "#cbd5e1";
    const textColor = isActive ? "#1e293b" : isDone ? "#22c55e" : "#94a3b8";
    svg += `<circle cx="${x}" cy="112" r="10" fill="${circleColor}"/>`;
    svg += `<text x="${x}" y="116" font-family="system-ui,sans-serif" font-size="10" fill="white" text-anchor="middle" font-weight="600">${isDone ? "✓" : i + 1}</text>`;
    svg += `<text x="${x + 18}" y="116" font-family="system-ui,sans-serif" font-size="12" fill="${textColor}">${steps[i]}</text>`;
    if (i < steps.length - 1) {
      const lineColor = isDone ? "#22c55e" : "#e2e8f0";
      svg += `<rect x="${x + 60}" y="111" width="${gap - 80}" height="2" fill="${lineColor}" rx="1"/>`;
    }
  }
  return svg;
}

function orderSummaryBox(options?: { discount?: boolean; highlightDiscount?: boolean; shipping?: string; highlightShipping?: boolean; error?: boolean }): string {
  const opts = options || {};
  const subtotal = 49.99;
  const discountAmount = opts.discount ? -10.00 : 0;
  const shippingCost = opts.shipping === "$0.00" ? 0 : 5.99;
  const total = subtotal + discountAmount + shippingCost;

  const boxStroke = opts.error ? "#ef4444" : "#e2e8f0";
  let svg = `
  <rect x="840" y="155" width="380" height="${opts.discount ? 320 : 280}" rx="8" fill="white" stroke="${boxStroke}" stroke-width="${opts.error ? 2 : 1}"/>
  <text x="860" y="185" font-family="system-ui,sans-serif" font-size="16" fill="#1e293b" font-weight="600">Order Summary</text>
  <rect x="860" y="198" width="340" height="1" fill="#e2e8f0"/>
  <!-- Item -->
  <rect x="860" y="210" width="40" height="40" rx="4" fill="#f1f5f9"/>
  <rect x="870" y="220" width="20" height="20" rx="2" fill="#cbd5e1"/>
  <text x="910" y="228" font-family="system-ui,sans-serif" font-size="12" fill="#334155">Wireless Bluetooth Headphones</text>
  <text x="910" y="244" font-family="system-ui,sans-serif" font-size="11" fill="#94a3b8">Qty: 1</text>
  <text x="1200" y="234" font-family="system-ui,sans-serif" font-size="12" fill="#334155" text-anchor="end">$${subtotal.toFixed(2)}</text>
  <rect x="860" y="262" width="340" height="1" fill="#e2e8f0"/>
  <!-- Subtotal -->
  <text x="860" y="285" font-family="system-ui,sans-serif" font-size="13" fill="#64748b">Subtotal</text>
  <text x="1200" y="285" font-family="system-ui,sans-serif" font-size="13" fill="#334155" text-anchor="end">$${subtotal.toFixed(2)}</text>`;

  let y = 308;

  if (opts.discount) {
    const discountBg = opts.highlightDiscount ? `<rect x="855" y="${y - 14}" width="350" height="22" rx="3" fill="${opts.error ? '#fef2f2' : '#f0fdf4'}"/>` : "";
    const discountColor = opts.error ? "#ef4444" : "#16a34a";
    svg += discountBg;
    svg += `<text x="860" y="${y}" font-family="system-ui,sans-serif" font-size="13" fill="${discountColor}">Discount (SAVE20)</text>`;
    svg += `<text x="1200" y="${y}" font-family="system-ui,sans-serif" font-size="13" fill="${discountColor}" text-anchor="end">-$${Math.abs(discountAmount).toFixed(2)}</text>`;
    y += 23;
  }

  // Shipping
  const shippingBg = opts.highlightShipping ? `<rect x="855" y="${y - 14}" width="350" height="22" rx="3" fill="${shippingCost > 0 && opts.highlightShipping ? '#fef2f2' : '#f0fdf4'}"/>` : "";
  svg += shippingBg;
  const shipColor = opts.highlightShipping && shippingCost > 0 ? "#ef4444" : "#64748b";
  svg += `<text x="860" y="${y}" font-family="system-ui,sans-serif" font-size="13" fill="${shipColor}">Shipping</text>`;
  svg += `<text x="1200" y="${y}" font-family="system-ui,sans-serif" font-size="13" fill="${shipColor}" text-anchor="end">${opts.shipping || '$' + shippingCost.toFixed(2)}</text>`;
  y += 25;

  svg += `<rect x="860" y="${y}" width="340" height="1" fill="#e2e8f0"/>`;
  y += 22;
  svg += `<text x="860" y="${y}" font-family="system-ui,sans-serif" font-size="15" fill="#1e293b" font-weight="700">Total</text>`;
  svg += `<text x="1200" y="${y}" font-family="system-ui,sans-serif" font-size="15" fill="#1e293b" font-weight="700" text-anchor="end">$${total.toFixed(2)}</text>`;

  return svg;
}

// ─── Page renderers ──────────────────────────────────────────────────

function productPage(ctx: ScreenshotContext): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#ffffff"/>
  ${browserChrome("https://demostore.example.com/products/wireless-headphones")}
  ${storeHeader()}
  <!-- Breadcrumb -->
  <text x="60" y="125" font-family="system-ui,sans-serif" font-size="11" fill="#94a3b8">Home / Electronics / Headphones</text>
  <!-- Product image area -->
  <rect x="60" y="145" width="440" height="440" rx="12" fill="#f8fafc" stroke="#e2e8f0"/>
  <rect x="140" y="200" width="280" height="280" rx="8" fill="#e2e8f0"/>
  <text x="280" y="350" font-family="system-ui,sans-serif" font-size="48" fill="#cbd5e1" text-anchor="middle">🎧</text>
  <!-- Thumbnails -->
  <rect x="60" y="600" width="80" height="80" rx="6" fill="#f1f5f9" stroke="#3b82f6" stroke-width="2"/>
  <rect x="150" y="600" width="80" height="80" rx="6" fill="#f1f5f9" stroke="#e2e8f0"/>
  <rect x="240" y="600" width="80" height="80" rx="6" fill="#f1f5f9" stroke="#e2e8f0"/>
  <!-- Product info -->
  <text x="540" y="175" font-family="system-ui,sans-serif" font-size="24" fill="#1e293b" font-weight="700">Wireless Bluetooth Headphones</text>
  <text x="540" y="200" font-family="system-ui,sans-serif" font-size="13" fill="#94a3b8">SKU: WBH-PRO-001</text>
  <!-- Rating -->
  <text x="540" y="230" font-family="system-ui,sans-serif" font-size="14" fill="#eab308">★★★★☆</text>
  <text x="620" y="230" font-family="system-ui,sans-serif" font-size="12" fill="#94a3b8">(2,847 reviews)</text>
  <!-- Price -->
  <text x="540" y="270" font-family="system-ui,sans-serif" font-size="32" fill="#1e293b" font-weight="700">$49.99</text>
  <text x="680" y="270" font-family="system-ui,sans-serif" font-size="16" fill="#94a3b8" text-decoration="line-through">$79.99</text>
  <rect x="720" y="253" width="48" height="22" rx="4" fill="#dcfce7"/>
  <text x="744" y="269" font-family="system-ui,sans-serif" font-size="11" fill="#16a34a" text-anchor="middle" font-weight="600">-38%</text>
  <!-- In stock -->
  <text x="540" y="305" font-family="system-ui,sans-serif" font-size="13" fill="#16a34a" font-weight="500">● In Stock</text>
  <text x="620" y="305" font-family="system-ui,sans-serif" font-size="12" fill="#94a3b8">Free delivery by Mar 18</text>
  <!-- Quantity selector -->
  <text x="540" y="345" font-family="system-ui,sans-serif" font-size="13" fill="#475569" font-weight="500">Quantity:</text>
  <rect x="540" y="355" width="100" height="36" rx="6" fill="white" stroke="#e2e8f0"/>
  <text x="575" y="378" font-family="system-ui,sans-serif" font-size="14" fill="#1e293b">1</text>
  <text x="555" y="378" font-family="system-ui,sans-serif" font-size="14" fill="#94a3b8">−</text>
  <text x="625" y="378" font-family="system-ui,sans-serif" font-size="14" fill="#94a3b8">+</text>
  <!-- Add to Cart button (highlighted) -->
  <rect x="540" y="410" width="340" height="48" rx="8" fill="#2563eb"/>
  <rect x="537" y="407" width="346" height="54" rx="10" fill="none" stroke="#3b82f6" stroke-width="3" stroke-dasharray="6,3" opacity="0.6"/>
  <text x="710" y="440" font-family="system-ui,sans-serif" font-size="16" fill="white" text-anchor="middle" font-weight="600">Add to Cart</text>
  <!-- Buy Now -->
  <rect x="540" y="470" width="340" height="40" rx="8" fill="white" stroke="#e2e8f0"/>
  <text x="710" y="496" font-family="system-ui,sans-serif" font-size="14" fill="#475569" text-anchor="middle">Buy Now</text>
  <!-- Features -->
  <rect x="540" y="530" width="700" height="1" fill="#e2e8f0"/>
  <text x="540" y="560" font-family="system-ui,sans-serif" font-size="14" fill="#1e293b" font-weight="600">Features</text>
  <text x="560" y="585" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">• Active Noise Cancellation (ANC)</text>
  <text x="560" y="605" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">• 40-hour battery life</text>
  <text x="560" y="625" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">• Bluetooth 5.3 with multipoint connection</text>
  <text x="560" y="645" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">• Foldable design with carry case</text>
</svg>`;
}

function cartPage(ctx: ScreenshotContext, highlightCheckout = false): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#f8fafc"/>
  ${browserChrome("https://demostore.example.com/cart")}
  ${storeHeader()}
  <!-- Page title -->
  <text x="60" y="130" font-family="system-ui,sans-serif" font-size="22" fill="#1e293b" font-weight="700">Shopping Cart (1 item)</text>
  <!-- Cart table header -->
  <rect x="60" y="150" width="740" height="36" rx="6" fill="#f1f5f9"/>
  <text x="80" y="173" font-family="system-ui,sans-serif" font-size="12" fill="#64748b" font-weight="600">PRODUCT</text>
  <text x="480" y="173" font-family="system-ui,sans-serif" font-size="12" fill="#64748b" font-weight="600">QTY</text>
  <text x="580" y="173" font-family="system-ui,sans-serif" font-size="12" fill="#64748b" font-weight="600">PRICE</text>
  <text x="700" y="173" font-family="system-ui,sans-serif" font-size="12" fill="#64748b" font-weight="600">TOTAL</text>
  <!-- Cart item -->
  <rect x="60" y="192" width="740" height="110" rx="0" fill="white" stroke="#e2e8f0"/>
  <rect x="80" y="210" width="75" height="75" rx="6" fill="#f1f5f9"/>
  <text x="117" y="255" font-family="system-ui,sans-serif" font-size="24" text-anchor="middle" fill="#cbd5e1">🎧</text>
  <text x="175" y="235" font-family="system-ui,sans-serif" font-size="14" fill="#1e293b" font-weight="500">Wireless Bluetooth Headphones</text>
  <text x="175" y="255" font-family="system-ui,sans-serif" font-size="11" fill="#94a3b8">Color: Black  |  SKU: WBH-PRO-001</text>
  <text x="175" y="280" font-family="system-ui,sans-serif" font-size="11" fill="#ef4444" cursor="pointer">Remove</text>
  <!-- Qty -->
  <rect x="465" y="230" width="80" height="30" rx="4" fill="white" stroke="#e2e8f0"/>
  <text x="490" y="250" font-family="system-ui,sans-serif" font-size="13" fill="#1e293b">1</text>
  <text x="475" y="250" font-family="system-ui,sans-serif" font-size="13" fill="#94a3b8">−</text>
  <text x="535" y="250" font-family="system-ui,sans-serif" font-size="13" fill="#94a3b8">+</text>
  <!-- Prices -->
  <text x="580" y="250" font-family="system-ui,sans-serif" font-size="14" fill="#334155">$49.99</text>
  <text x="700" y="250" font-family="system-ui,sans-serif" font-size="14" fill="#1e293b" font-weight="600">$49.99</text>
  ${orderSummaryBox()}
  <!-- Checkout button -->
  <rect x="840" y="${highlightCheckout ? 475 : 480}" width="380" height="48" rx="8" fill="#2563eb"/>
  ${highlightCheckout ? '<rect x="837" y="472" width="386" height="54" rx="10" fill="none" stroke="#3b82f6" stroke-width="3" stroke-dasharray="6,3" opacity="0.6"/>' : ""}
  <text x="1030" y="510" font-family="system-ui,sans-serif" font-size="15" fill="white" text-anchor="middle" font-weight="600">Proceed to Checkout</text>
  <!-- Continue shopping -->
  <text x="1030" y="545" font-family="system-ui,sans-serif" font-size="12" fill="#3b82f6" text-anchor="middle">Continue Shopping</text>
</svg>`;
}

function promoCodePage(ctx: ScreenshotContext): string {
  const isFailed = ctx.status === "failed";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#f8fafc"/>
  ${browserChrome("https://demostore.example.com/cart")}
  ${storeHeader()}
  <text x="60" y="130" font-family="system-ui,sans-serif" font-size="22" fill="#1e293b" font-weight="700">Shopping Cart (1 item)</text>
  <!-- Cart item (compact) -->
  <rect x="60" y="150" width="740" height="90" fill="white" stroke="#e2e8f0" rx="8"/>
  <rect x="80" y="165" width="60" height="60" rx="6" fill="#f1f5f9"/>
  <text x="110" y="200" font-family="system-ui,sans-serif" font-size="20" text-anchor="middle" fill="#cbd5e1">🎧</text>
  <text x="160" y="190" font-family="system-ui,sans-serif" font-size="14" fill="#1e293b" font-weight="500">Wireless Bluetooth Headphones</text>
  <text x="160" y="210" font-family="system-ui,sans-serif" font-size="12" fill="#94a3b8">Qty: 1</text>
  <text x="700" y="200" font-family="system-ui,sans-serif" font-size="15" fill="#1e293b" font-weight="600" text-anchor="end">$49.99</text>
  <!-- Promo code section (highlighted) -->
  <rect x="60" y="260" width="740" height="100" fill="white" stroke="#3b82f6" stroke-width="2" rx="8"/>
  <rect x="57" y="257" width="746" height="106" rx="10" fill="none" stroke="#3b82f6" stroke-width="2" stroke-dasharray="6,3" opacity="0.4"/>
  <text x="80" y="290" font-family="system-ui,sans-serif" font-size="14" fill="#1e293b" font-weight="600">Promo Code</text>
  <rect x="80" y="305" width="400" height="40" rx="6" fill="white" stroke="#3b82f6" stroke-width="2"/>
  <text x="96" y="330" font-family="system-ui,sans-serif" font-size="14" fill="#1e293b" font-weight="500">SAVE20</text>
  <rect x="490" y="305" width="100" height="40" rx="6" fill="#2563eb"/>
  <text x="540" y="330" font-family="system-ui,sans-serif" font-size="13" fill="white" text-anchor="middle" font-weight="600">Apply</text>
  ${isFailed ? `
  <text x="80" y="385" font-family="system-ui,sans-serif" font-size="12" fill="#ef4444">Promo code could not be applied</text>
  ` : `
  <rect x="60" y="375" width="740" height="36" rx="6" fill="#f0fdf4" stroke="#bbf7d0"/>
  <text x="80" y="398" font-family="system-ui,sans-serif" font-size="13" fill="#16a34a" font-weight="500">✓ Promo code SAVE20 applied — 20% discount ($10.00 off)</text>
  `}
  ${orderSummaryBox({ discount: !isFailed })}
  <rect x="840" y="510" width="380" height="48" rx="8" fill="#2563eb"/>
  <text x="1030" y="540" font-family="system-ui,sans-serif" font-size="15" fill="white" text-anchor="middle" font-weight="600">Proceed to Checkout</text>
</svg>`;
}

function shippingAddressPage(ctx: ScreenshotContext, submitting = false): string {
  const isFailed = ctx.status === "failed";
  const borderColor = isFailed ? "#ef4444" : "#e2e8f0";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#f8fafc"/>
  ${browserChrome("https://demostore.example.com/checkout/shipping")}
  ${storeHeader()}
  ${checkoutProgress(1)}
  <!-- Form -->
  <rect x="60" y="150" width="740" height="520" rx="8" fill="white" stroke="#e2e8f0"/>
  <text x="80" y="185" font-family="system-ui,sans-serif" font-size="18" fill="#1e293b" font-weight="700">Shipping Address</text>
  <!-- Name fields -->
  <text x="80" y="218" font-family="system-ui,sans-serif" font-size="12" fill="#475569" font-weight="500">Full Name</text>
  <rect x="80" y="225" width="340" height="38" rx="6" fill="white" stroke="#d1d5db"/>
  <text x="96" y="249" font-family="system-ui,sans-serif" font-size="13" fill="#1e293b">John Doe</text>
  <text x="440" y="218" font-family="system-ui,sans-serif" font-size="12" fill="#475569" font-weight="500">Email</text>
  <rect x="440" y="225" width="340" height="38" rx="6" fill="white" stroke="#d1d5db"/>
  <text x="456" y="249" font-family="system-ui,sans-serif" font-size="13" fill="#1e293b">john@example.com</text>
  <!-- Address -->
  <text x="80" y="290" font-family="system-ui,sans-serif" font-size="12" fill="#475569" font-weight="500">Street Address</text>
  <rect x="80" y="297" width="700" height="38" rx="6" fill="white" stroke="#d1d5db"/>
  <text x="96" y="321" font-family="system-ui,sans-serif" font-size="13" fill="#1e293b">123 Main St</text>
  <!-- City, State, ZIP row -->
  <text x="80" y="362" font-family="system-ui,sans-serif" font-size="12" fill="#475569" font-weight="500">City</text>
  <rect x="80" y="369" width="280" height="38" rx="6" fill="white" stroke="#d1d5db"/>
  <text x="96" y="393" font-family="system-ui,sans-serif" font-size="13" fill="#1e293b">San Francisco</text>
  <text x="380" y="362" font-family="system-ui,sans-serif" font-size="12" fill="#475569" font-weight="500">State</text>
  <rect x="380" y="369" width="160" height="38" rx="6" fill="white" stroke="#d1d5db"/>
  <text x="396" y="393" font-family="system-ui,sans-serif" font-size="13" fill="#1e293b">CA</text>
  <text x="560" y="362" font-family="system-ui,sans-serif" font-size="12" fill="${isFailed ? '#ef4444' : '#475569'}" font-weight="500">ZIP Code${isFailed ? ' ✗' : ''}</text>
  <rect x="560" y="369" width="220" height="38" rx="6" fill="white" stroke="${isFailed ? '#ef4444' : '#d1d5db'}" stroke-width="${isFailed ? 2 : 1}"/>
  <text x="576" y="393" font-family="system-ui,sans-serif" font-size="13" fill="#1e293b">01103</text>
  ${isFailed ? `
  <text x="560" y="422" font-family="system-ui,sans-serif" font-size="11" fill="#ef4444">ZIP code must be 5 digits</text>
  <rect x="60" y="440" width="740" height="36" rx="6" fill="#fef2f2" stroke="#fecaca"/>
  <text x="80" y="463" font-family="system-ui,sans-serif" font-size="12" fill="#ef4444" font-weight="500">✗ Address validation failed. Please check your ZIP code.</text>
  ` : ''}
  <!-- Phone -->
  <text x="80" y="${isFailed ? 498 : 434}" font-family="system-ui,sans-serif" font-size="12" fill="#475569" font-weight="500">Phone</text>
  <rect x="80" y="${isFailed ? 505 : 441}" width="340" height="38" rx="6" fill="white" stroke="#d1d5db"/>
  <text x="96" y="${isFailed ? 529 : 465}" font-family="system-ui,sans-serif" font-size="13" fill="#1e293b">(555) 123-4567</text>
  <!-- Continue button -->
  <rect x="80" y="${isFailed ? 570 : 510}" width="300" height="44" rx="8" fill="${submitting ? '#1d4ed8' : '#2563eb'}"/>
  <text x="230" y="${isFailed ? 597 : 537}" font-family="system-ui,sans-serif" font-size="14" fill="white" text-anchor="middle" font-weight="600">${submitting ? 'Validating...' : 'Continue to Shipping Method'}</text>
  ${orderSummaryBox()}
</svg>`;
}

function shippingMethodPage(ctx: ScreenshotContext): string {
  const isFailed = ctx.status === "failed";
  const isPickupScenario = ctx.scenarioId.includes("pickup");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#f8fafc"/>
  ${browserChrome("https://demostore.example.com/checkout/shipping-method")}
  ${storeHeader()}
  ${checkoutProgress(1)}
  <rect x="60" y="150" width="740" height="460" rx="8" fill="white" stroke="#e2e8f0"/>
  <text x="80" y="185" font-family="system-ui,sans-serif" font-size="18" fill="#1e293b" font-weight="700">Delivery Method</text>
  <!-- Standard Shipping -->
  <rect x="80" y="205" width="700" height="70" rx="8" fill="${!isPickupScenario ? '#eff6ff' : 'white'}" stroke="${!isPickupScenario ? '#3b82f6' : '#e2e8f0'}" stroke-width="${!isPickupScenario ? 2 : 1}"/>
  <circle cx="105" cy="240" r="8" fill="white" stroke="${!isPickupScenario ? '#3b82f6' : '#d1d5db'}" stroke-width="2"/>
  ${!isPickupScenario ? '<circle cx="105" cy="240" r="4" fill="#3b82f6"/>' : ''}
  <text x="125" y="233" font-family="system-ui,sans-serif" font-size="14" fill="#1e293b" font-weight="500">Standard Shipping</text>
  <text x="125" y="253" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">Delivered in 5-7 business days</text>
  <text x="760" y="245" font-family="system-ui,sans-serif" font-size="14" fill="#1e293b" font-weight="600" text-anchor="end">$5.99</text>
  <!-- Express -->
  <rect x="80" y="285" width="700" height="70" rx="8" fill="white" stroke="#e2e8f0"/>
  <circle cx="105" cy="320" r="8" fill="white" stroke="#d1d5db" stroke-width="2"/>
  <text x="125" y="313" font-family="system-ui,sans-serif" font-size="14" fill="#1e293b" font-weight="500">Express Shipping</text>
  <text x="125" y="333" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">Delivered in 1-2 business days</text>
  <text x="760" y="325" font-family="system-ui,sans-serif" font-size="14" fill="#1e293b" font-weight="600" text-anchor="end">$14.99</text>
  <!-- Pickup -->
  <rect x="80" y="365" width="700" height="70" rx="8" fill="${isPickupScenario ? '#eff6ff' : 'white'}" stroke="${isPickupScenario ? '#3b82f6' : '#e2e8f0'}" stroke-width="${isPickupScenario ? 2 : 1}"/>
  <circle cx="105" cy="400" r="8" fill="white" stroke="${isPickupScenario ? '#3b82f6' : '#d1d5db'}" stroke-width="2"/>
  ${isPickupScenario ? '<circle cx="105" cy="400" r="4" fill="#3b82f6"/>' : ''}
  <text x="125" y="393" font-family="system-ui,sans-serif" font-size="14" fill="#1e293b" font-weight="500">In-Store Pickup</text>
  <text x="125" y="413" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">Pick up at DemoStore - Downtown (ready in 2 hours)</text>
  <text x="760" y="405" font-family="system-ui,sans-serif" font-size="14" fill="#16a34a" font-weight="600" text-anchor="end">FREE</text>
  <!-- Continue -->
  <rect x="80" y="460" width="300" height="44" rx="8" fill="#2563eb"/>
  <text x="230" y="487" font-family="system-ui,sans-serif" font-size="14" fill="white" text-anchor="middle" font-weight="600">Continue to Payment</text>
  ${orderSummaryBox({
    highlightShipping: isPickupScenario && isFailed,
    shipping: isPickupScenario ? (isFailed ? "$5.99" : "$0.00") : undefined
  })}
  ${isFailed && isPickupScenario ? `
  <rect x="840" y="510" width="380" height="36" rx="6" fill="#fef2f2" stroke="#fecaca"/>
  <text x="860" y="533" font-family="system-ui,sans-serif" font-size="12" fill="#ef4444" font-weight="500">⚠ Shipping fee not removed for pickup</text>
  ` : ''}
</svg>`;
}

function paymentPage(ctx: ScreenshotContext): string {
  const isFailed = ctx.status === "failed";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#f8fafc"/>
  ${browserChrome("https://demostore.example.com/checkout/payment")}
  ${storeHeader()}
  ${checkoutProgress(2)}
  <rect x="60" y="150" width="740" height="480" rx="8" fill="white" stroke="#e2e8f0"/>
  <text x="80" y="185" font-family="system-ui,sans-serif" font-size="18" fill="#1e293b" font-weight="700">Payment Details</text>
  <!-- Card type tabs -->
  <rect x="80" y="205" width="120" height="36" rx="6" fill="#eff6ff" stroke="#3b82f6"/>
  <text x="140" y="228" font-family="system-ui,sans-serif" font-size="12" fill="#2563eb" text-anchor="middle" font-weight="500">Credit Card</text>
  <rect x="210" y="205" width="100" height="36" rx="6" fill="white" stroke="#e2e8f0"/>
  <text x="260" y="228" font-family="system-ui,sans-serif" font-size="12" fill="#64748b" text-anchor="middle">PayPal</text>
  <!-- Card number -->
  <text x="80" y="270" font-family="system-ui,sans-serif" font-size="12" fill="#475569" font-weight="500">Card Number</text>
  <rect x="80" y="278" width="700" height="42" rx="6" fill="white" stroke="#d1d5db"/>
  <text x="96" y="304" font-family="monospace" font-size="14" fill="#1e293b">4111  1111  1111  1111</text>
  <text x="740" y="304" font-family="system-ui,sans-serif" font-size="11" fill="#94a3b8" text-anchor="end">VISA</text>
  <!-- Expiry + CVV row -->
  <text x="80" y="345" font-family="system-ui,sans-serif" font-size="12" fill="#475569" font-weight="500">Expiry Date</text>
  <rect x="80" y="353" width="200" height="42" rx="6" fill="white" stroke="#d1d5db"/>
  <text x="96" y="379" font-family="system-ui,sans-serif" font-size="14" fill="#1e293b">12 / 27</text>
  <text x="310" y="345" font-family="system-ui,sans-serif" font-size="12" fill="#475569" font-weight="500">CVV</text>
  <rect x="310" y="353" width="120" height="42" rx="6" fill="white" stroke="#d1d5db"/>
  <text x="326" y="379" font-family="system-ui,sans-serif" font-size="14" fill="#1e293b">•••</text>
  <!-- Name on card -->
  <text x="80" y="420" font-family="system-ui,sans-serif" font-size="12" fill="#475569" font-weight="500">Name on Card</text>
  <rect x="80" y="428" width="700" height="42" rx="6" fill="white" stroke="#d1d5db"/>
  <text x="96" y="454" font-family="system-ui,sans-serif" font-size="14" fill="#1e293b">John Doe</text>
  <!-- Billing same as shipping -->
  <rect x="80" y="490" width="16" height="16" rx="3" fill="#2563eb"/>
  <text x="82" y="503" font-family="system-ui,sans-serif" font-size="11" fill="white" font-weight="700">✓</text>
  <text x="105" y="503" font-family="system-ui,sans-serif" font-size="12" fill="#475569">Billing address same as shipping</text>
  <!-- Secure badge -->
  <text x="80" y="540" font-family="system-ui,sans-serif" font-size="11" fill="#16a34a">🔒 256-bit SSL encrypted</text>
  <!-- Continue -->
  <rect x="80" y="560" width="300" height="44" rx="8" fill="#2563eb"/>
  <text x="230" y="587" font-family="system-ui,sans-serif" font-size="14" fill="white" text-anchor="middle" font-weight="600">Review Order</text>
  ${orderSummaryBox()}
</svg>`;
}

function reviewPage(ctx: ScreenshotContext, highlight?: "discount" | "shipping"): string {
  const isFailed = ctx.status === "failed";
  const isPromoScenario = ctx.scenarioId.includes("promo");
  const isPickupScenario = ctx.scenarioId.includes("pickup");

  const showDiscount = highlight === "discount" ? !isFailed : isPromoScenario;
  const highlightDiscount = highlight === "discount";
  const highlightShipping = highlight === "shipping";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#f8fafc"/>
  ${browserChrome("https://demostore.example.com/checkout/review")}
  ${storeHeader()}
  ${checkoutProgress(3)}
  <rect x="60" y="150" width="740" height="500" rx="8" fill="white" stroke="#e2e8f0"/>
  <text x="80" y="185" font-family="system-ui,sans-serif" font-size="18" fill="#1e293b" font-weight="700">Review Your Order</text>
  <!-- Shipping address summary -->
  <text x="80" y="218" font-family="system-ui,sans-serif" font-size="13" fill="#475569" font-weight="600">Shipping To:</text>
  <text x="80" y="238" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">John Doe, 123 Main St, San Francisco, CA 94105</text>
  <text x="720" y="228" font-family="system-ui,sans-serif" font-size="12" fill="#3b82f6" text-anchor="end">Edit</text>
  <rect x="80" y="252" width="700" height="1" fill="#e2e8f0"/>
  <!-- Payment summary -->
  <text x="80" y="278" font-family="system-ui,sans-serif" font-size="13" fill="#475569" font-weight="600">Payment Method:</text>
  <text x="80" y="298" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">Visa ending in 1111</text>
  <text x="720" y="288" font-family="system-ui,sans-serif" font-size="12" fill="#3b82f6" text-anchor="end">Edit</text>
  <rect x="80" y="312" width="700" height="1" fill="#e2e8f0"/>
  <!-- Delivery method -->
  <text x="80" y="338" font-family="system-ui,sans-serif" font-size="13" fill="#475569" font-weight="600">Delivery:</text>
  <text x="80" y="358" font-family="system-ui,sans-serif" font-size="12" fill="#64748b">${isPickupScenario ? 'In-Store Pickup — DemoStore Downtown' : 'Standard Shipping — 5-7 business days'}</text>
  <rect x="80" y="372" width="700" height="1" fill="#e2e8f0"/>
  <!-- Item -->
  <rect x="80" y="390" width="60" height="60" rx="6" fill="#f1f5f9"/>
  <text x="110" y="425" font-family="system-ui,sans-serif" font-size="20" text-anchor="middle" fill="#cbd5e1">🎧</text>
  <text x="155" y="414" font-family="system-ui,sans-serif" font-size="14" fill="#1e293b" font-weight="500">Wireless Bluetooth Headphones</text>
  <text x="155" y="434" font-family="system-ui,sans-serif" font-size="12" fill="#94a3b8">Qty: 1</text>
  <text x="700" y="420" font-family="system-ui,sans-serif" font-size="14" fill="#1e293b" font-weight="600" text-anchor="end">$49.99</text>
  ${highlightDiscount && isFailed ? `
  <!-- Missing discount warning -->
  <rect x="80" y="470" width="700" height="36" rx="6" fill="#fef2f2" stroke="#fecaca"/>
  <text x="100" y="493" font-family="system-ui,sans-serif" font-size="12" fill="#ef4444" font-weight="500">⚠ Expected SAVE20 discount is not applied — promo code missing from order</text>
  ` : ''}
  <!-- Place order button -->
  <rect x="80" y="530" width="700" height="50" rx="8" fill="#16a34a"/>
  <text x="430" y="560" font-family="system-ui,sans-serif" font-size="16" fill="white" text-anchor="middle" font-weight="700">Place Order — $${showDiscount ? '45.98' : isPickupScenario && !isFailed ? '49.99' : '55.98'}</text>
  <!-- Terms -->
  <text x="430" y="610" font-family="system-ui,sans-serif" font-size="10" fill="#94a3b8" text-anchor="middle">By placing your order you agree to our Terms of Service and Privacy Policy</text>
  ${orderSummaryBox({
    discount: showDiscount,
    highlightDiscount: highlightDiscount && isFailed,
    highlightShipping: highlightShipping && isFailed,
    shipping: isPickupScenario ? (isFailed ? "$5.99" : "$0.00") : undefined,
    error: isFailed,
  })}
</svg>`;
}

function orderConfirmPage(ctx: ScreenshotContext): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#f8fafc"/>
  ${browserChrome("https://demostore.example.com/order/confirmation")}
  ${storeHeader()}
  <!-- Success card centered -->
  <rect x="240" y="160" width="800" height="440" rx="16" fill="white" stroke="#bbf7d0" stroke-width="2"/>
  <!-- Checkmark circle -->
  <circle cx="640" cy="230" r="40" fill="#dcfce7"/>
  <circle cx="640" cy="230" r="28" fill="#22c55e"/>
  <text x="640" y="240" font-family="system-ui,sans-serif" font-size="28" fill="white" text-anchor="middle" font-weight="700">✓</text>
  <text x="640" y="300" font-family="system-ui,sans-serif" font-size="26" fill="#1e293b" text-anchor="middle" font-weight="700">Order Confirmed!</text>
  <text x="640" y="330" font-family="system-ui,sans-serif" font-size="14" fill="#64748b" text-anchor="middle">Thank you for your purchase. Your order has been placed successfully.</text>
  <!-- Order details -->
  <rect x="340" y="360" width="600" height="1" fill="#e2e8f0"/>
  <text x="360" y="395" font-family="system-ui,sans-serif" font-size="13" fill="#64748b">Order Number</text>
  <text x="920" y="395" font-family="system-ui,sans-serif" font-size="13" fill="#1e293b" text-anchor="end" font-weight="600">ORD-2026-48291</text>
  <text x="360" y="425" font-family="system-ui,sans-serif" font-size="13" fill="#64748b">Estimated Delivery</text>
  <text x="920" y="425" font-family="system-ui,sans-serif" font-size="13" fill="#1e293b" text-anchor="end" font-weight="600">March 19-21, 2026</text>
  <text x="360" y="455" font-family="system-ui,sans-serif" font-size="13" fill="#64748b">Total Charged</text>
  <text x="920" y="455" font-family="system-ui,sans-serif" font-size="13" fill="#1e293b" text-anchor="end" font-weight="600">$55.98</text>
  <text x="360" y="485" font-family="system-ui,sans-serif" font-size="13" fill="#64748b">Payment</text>
  <text x="920" y="485" font-family="system-ui,sans-serif" font-size="13" fill="#1e293b" text-anchor="end" font-weight="600">Visa ****1111</text>
  <!-- Buttons -->
  <rect x="390" y="520" width="220" height="44" rx="8" fill="#2563eb"/>
  <text x="500" y="547" font-family="system-ui,sans-serif" font-size="14" fill="white" text-anchor="middle" font-weight="600">Track Order</text>
  <rect x="630" y="520" width="220" height="44" rx="8" fill="white" stroke="#e2e8f0"/>
  <text x="740" y="547" font-family="system-ui,sans-serif" font-size="14" fill="#475569" text-anchor="middle">Continue Shopping</text>
  <!-- Email notice -->
  <text x="640" y="590" font-family="system-ui,sans-serif" font-size="11" fill="#94a3b8" text-anchor="middle">A confirmation email has been sent to john@example.com</text>
</svg>`;
}

function orderErrorPage(ctx: ScreenshotContext): string {
  const isPayment = ctx.scenarioId.includes("payment");
  const isInventory = ctx.scenarioId.includes("inventory");

  let errorTitle = "Order Could Not Be Completed";
  let errorDetail = "An unexpected error occurred while processing your order.";
  let errorCode = "ERR_CHECKOUT_FAILED";

  if (isPayment) {
    errorTitle = "Payment Failed";
    errorDetail = "We couldn't process your payment. The payment gateway timed out after 30 seconds. Your card may or may not have been charged.";
    errorCode = "504 GATEWAY_TIMEOUT";
  } else if (isInventory) {
    errorTitle = "Item Out of Stock";
    errorDetail = "Sorry, the item in your cart is no longer available. Our inventory was updated while you were checking out.";
    errorCode = "409 INSUFFICIENT_STOCK";
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#f8fafc"/>
  ${browserChrome("https://demostore.example.com/checkout/error")}
  ${storeHeader()}
  <!-- Error card -->
  <rect x="240" y="160" width="800" height="420" rx="16" fill="white" stroke="#fecaca" stroke-width="2"/>
  <!-- Error icon -->
  <circle cx="640" cy="230" r="40" fill="#fef2f2"/>
  <circle cx="640" cy="230" r="28" fill="#ef4444"/>
  <text x="640" y="241" font-family="system-ui,sans-serif" font-size="28" fill="white" text-anchor="middle" font-weight="700">!</text>
  <text x="640" y="298" font-family="system-ui,sans-serif" font-size="24" fill="#1e293b" text-anchor="middle" font-weight="700">${esc(errorTitle)}</text>
  <text x="640" y="330" font-family="system-ui,sans-serif" font-size="13" fill="#64748b" text-anchor="middle">${esc(errorDetail)}</text>
  ${isPayment ? '<text x="640" y="355" font-family="system-ui,sans-serif" font-size="13" fill="#ef4444" text-anchor="middle" font-weight="500">Please check your bank statement before retrying.</text>' : ''}
  <!-- Error code -->
  <rect x="440" y="380" width="400" height="32" rx="6" fill="#fef2f2"/>
  <text x="640" y="401" font-family="monospace" font-size="12" fill="#ef4444" text-anchor="middle">${esc(errorCode)}</text>
  <!-- Buttons -->
  <rect x="390" y="440" width="220" height="44" rx="8" fill="#ef4444"/>
  <text x="500" y="467" font-family="system-ui,sans-serif" font-size="14" fill="white" text-anchor="middle" font-weight="600">Try Again</text>
  <rect x="630" y="440" width="220" height="44" rx="8" fill="white" stroke="#e2e8f0"/>
  <text x="740" y="467" font-family="system-ui,sans-serif" font-size="14" fill="#475569" text-anchor="middle">Contact Support</text>
  <!-- Console error (developer detail) -->
  <rect x="280" y="510" width="720" height="50" rx="6" fill="#1e293b"/>
  <text x="300" y="530" font-family="monospace" font-size="10" fill="#f87171">Error: ${esc(ctx.failureDetail || 'Checkout failed at final step')}</text>
  <text x="300" y="548" font-family="monospace" font-size="10" fill="#64748b">at CheckoutController.placeOrder (checkout.js:247)</text>
</svg>`;
}

function checkoutGenericPage(ctx: ScreenshotContext): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
  <rect width="1280" height="720" fill="#f8fafc"/>
  ${browserChrome("https://demostore.example.com/checkout")}
  ${storeHeader()}
  ${checkoutProgress(1)}
  <rect x="60" y="150" width="740" height="400" rx="8" fill="white" stroke="#e2e8f0"/>
  <text x="80" y="185" font-family="system-ui,sans-serif" font-size="18" fill="#1e293b" font-weight="700">${esc(ctx.stepName)}</text>
  <text x="80" y="215" font-family="system-ui,sans-serif" font-size="13" fill="#64748b">Processing checkout step...</text>
  ${orderSummaryBox()}
</svg>`;
}

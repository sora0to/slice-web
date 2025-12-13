// cart.js
document.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEY = "slice_of_ukraine_cart_v1";

  // cart elements
  const cartBtn = document.getElementById("cartBtn");
  const cartModal = document.getElementById("cartModal");
  const cartClose = document.getElementById("cartClose");
  const cartItems = document.getElementById("cartItems");
  const cartTotalEl = document.getElementById("cartTotal");

  // checkout elements
  const checkoutBtn = document.getElementById("checkoutBtn");
  const checkoutModal = document.getElementById("checkoutModal");
  const checkoutForm = document.getElementById("checkoutForm");
  const checkoutClose = document.getElementById("checkoutClose");

  let cart = window.cart || [];

  // helpers
  function priceToNumber(val) {
    if (val === undefined || val === null) return 0;
    const s = String(val).replace(",", ".");
    const matches = s.match(/-?\d+(\.\d+)?/g);
    if (!matches || !matches.length) return 0;
    const n = parseFloat(matches[matches.length - 1]);
    return Number.isFinite(n) ? n : 0;
  }

  function detectCurrencySymbol(text) {
    if (!text) return "CA$";
    if (text.includes("CAD")) return "CA$";
    if (text.includes("$")) return "CA$";
    return "CA$";
  }

  function saveCart() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
    } catch (e) {
      console.warn(e);
    }
  }

  function loadCart() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function findProductInCatalogById(id) {
    const all = window.__CATALOG && window.__CATALOG.allProducts;
    if (Array.isArray(all)) return all.find((p) => String(p.id) === String(id));
    return null;
  }

  function normalizeProductFromCard(cardElem) {
    if (!cardElem) return null;
    const idFromDataId = cardElem.querySelector(".btn-detail")?.dataset?.id;
    const id = idFromDataId || cardElem.dataset.index || null;
    const titleNode = cardElem.querySelector("h3");
    const title_en = titleNode?.dataset?.en || "";
    const title_uk = titleNode?.dataset?.uk || "";
    const title =
      title_en ||
      title_uk ||
      (titleNode && titleNode.textContent.trim()) ||
      `Product ${id || ""}`;
    const img = cardElem.querySelector("img")?.src || "";
    const priceText = (
      cardElem.querySelector(".price")?.textContent || ""
    ).trim();
    const priceNum = priceToNumber(priceText);
    const currency = "CA$";
    return { id, title, img, price: priceNum, priceText, currency };
  }

  function findCardById(id) {
    const btn = document.querySelector(
      `.btn-detail[data-id="${id}"], .btn-add[data-id="${id}"]`
    );
    if (btn) return btn.closest(".product");
    const card = Array.from(
      document.querySelectorAll("#catalogGrid .product")
    ).find((p) => String(p.dataset.index) === String(id));
    return card || null;
  }

  function ensureAddButtons() {
    const products = document.querySelectorAll("#catalogGrid .product");
    products.forEach((prod) => {
      if (!prod.querySelector(".btn-add")) {
        const id =
          prod.querySelector(".btn-detail")?.dataset?.id ||
          prod.dataset.index ||
          "";
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "btn-add";
        btn.dataset.id = id;
        btn.textContent = "В корзину";
        btn.style.cssText =
          "padding:8px 10px;border-radius:8px;border:1px solid #ddd;background:var(--accent);font-weight:700;cursor:pointer";
        const controls = prod.querySelector("div") || prod;
        controls.appendChild(btn);
      }
    });
  }

  // ensure catalog add buttons
  ensureAddButtons();
  const grid = document.getElementById("catalogGrid");
  if (grid) {
    const mo = new MutationObserver(() => {
      ensureAddButtons();
    });
    mo.observe(grid, { childList: true, subtree: true });
  }

  // basic cart operations
  function updateCartUI() {
    if (!cartItems) return;
    cartItems.innerHTML = "";
    let total = 0;
    let currency = "CA$";

    cart.forEach((item) => {
      const priceNum = priceToNumber(item.price);
      total += priceNum * item.qty;
      if (item.currency) currency = item.currency;

      const row = document.createElement("div");
      row.className = "cart-item";
      row.style.cssText =
        "border-radius:8px;padding:8px;background:#fafafa;display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px";
      row.innerHTML = `
        <div style="display:flex;gap:8px;align-items:center">
          <img src="${item.img || ""}" alt="${
        item.title
      }" style="width:56px;height:56px;object-fit:cover;border-radius:6px">
          <div>
            <p style="margin:0;font-weight:700">${item.title}</p>
            <p style="margin:0;font-size:13px;color:#666">${priceNum.toFixed(
              2
            )} ${item.currency || currency}</p>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px">
          <div style="display:flex;gap:6px;align-items:center">
            <button class="qty-decrease" data-id="${
              item.id
            }" style="padding:6px">−</button>
            <span style="min-width:28px;text-align:center">${item.qty}</span>
            <button class="qty-increase" data-id="${
              item.id
            }" style="padding:6px">+</button>
          </div>
          <button class="remove-item" data-id="${
            item.id
          }" data-uk="Видалити" data-en="Remove" style="background:none;border:1px solid #ddd;padding:6px;border-radius:6px;cursor:pointer">Видалити</button>
        </div>
      `;
      cartItems.appendChild(row);
    });

    const displayCurrency = "CA$";
    if (cartTotalEl)
      cartTotalEl.textContent = `Разом: ${total.toFixed(
        2
      )} ${displayCurrency}`;

    if (cartBtn) {
      const countSpan = cartBtn.querySelector("#cartCount");
      const totalQty = cart.reduce((s, i) => s + i.qty, 0);
      if (countSpan) countSpan.textContent = totalQty;
      else cartBtn.textContent = `🛒 ${totalQty}`;
    }

    saveCart();
    window.cart = cart;
    window.updateCartUI = updateCartUI;
  }

  function addToCartById(id, qty = 1) {
    const prodFromCatalog = findProductInCatalogById(id);
    let product = null;

    if (prodFromCatalog) {
      product = {
        id: prodFromCatalog.id,
        title:
          prodFromCatalog.title_en ||
          prodFromCatalog.title_uk ||
          prodFromCatalog.title ||
          `Product ${prodFromCatalog.id}`,
        img: prodFromCatalog.img || "",
        price:
          prodFromCatalog.discount && prodFromCatalog.discount !== "0"
            ? prodFromCatalog.discount
            : prodFromCatalog.price,
        currency: "CA$",
      };
    } else {
      const card = findCardById(id);
      if (card) {
        const normalized = normalizeProductFromCard(card);
        product = {
          id: normalized.id || id,
          title: normalized.title,
          img: normalized.img,
          price: normalized.price,
          currency: "CA$",
        };
      }
    }

    if (!product) {
      console.warn("Не вдалося знайти продукт для додавання:", id);
      return;
    }

    product.price = String(product.price);
    const found = cart.find((i) => String(i.id) === String(product.id));
    if (found) {
      found.qty += qty;
    } else {
      cart.push({
        id: product.id,
        title: product.title,
        img: product.img,
        price: product.price,
        qty: qty,
        currency: "CA$",
      });
    }
    updateCartUI();

    if (cartBtn)
      cartBtn.animate(
        [
          { transform: "scale(1)" },
          { transform: "scale(1.06)" },
          { transform: "scale(1)" },
        ],
        { duration: 220 }
      );
  }

  function addToCartFromModal() {
    const modal = document.getElementById("productModal");
    if (!modal) return;
    const title = (
      modal.querySelector("#modalTitle")?.textContent || ""
    ).trim();
    const priceText = (
      modal.querySelector("#modalPrice")?.textContent || ""
    ).trim();
    const imgStyle =
      modal.querySelector("#modalImage")?.style?.backgroundImage || "";
    const imgMatch = imgStyle.match(/url\(['"]?(.*?)['"]?\)/);
    const img = imgMatch ? imgMatch[1] : "";
    const priceNum = priceToNumber(priceText);
    const currency = "CA$";
    const tempId = "modal-" + Date.now();
    const product = {
      id: tempId,
      title: title || "Product",
      img,
      price: priceNum,
      currency,
    };
    cart.push({
      id: product.id,
      title: product.title,
      img: product.img,
      price: String(product.price),
      qty: 1,
      currency: product.currency,
    });
    updateCartUI();
  }

  function removeFromCart(id) {
    cart = cart.filter((i) => String(i.id) !== String(id));
    updateCartUI();
  }

  function changeQty(id, delta) {
    const it = cart.find((i) => String(i.id) === String(id));
    if (!it) return;
    it.qty = Math.max(0, it.qty + delta);
    if (it.qty === 0) removeFromCart(id);
    else updateCartUI();
  }

  function clearCart() {
    cart = [];
    updateCartUI();
  }

  // init cart
  cart = loadCart();
  updateCartUI();

  // cart modal UI
  if (cartBtn)
    cartBtn.addEventListener("click", () => {
      if (cartModal) {
        cartModal.style.display = "flex";
        cartModal.setAttribute("aria-hidden", "false");
      }
    });

  if (cartClose)
    cartClose.addEventListener("click", () => {
      if (cartModal) {
        cartModal.style.display = "none";
        cartModal.setAttribute("aria-hidden", "true");
      }
    });

  if (cartModal)
    cartModal.addEventListener("click", (e) => {
      if (e.target === cartModal) {
        cartModal.style.display = "none";
        cartModal.setAttribute("aria-hidden", "true");
      }
    });

  // checkout modal open/close
  if (checkoutBtn && checkoutModal) {
    checkoutBtn.addEventListener("click", () => {
      if (!cart.length) {
        alert("Кошик порожній");
        return;
      };
      checkoutModal.style.display = "flex";
    });
  }

  if (checkoutClose && checkoutModal) {
    checkoutClose.addEventListener("click", () => {
      checkoutModal.style.display = "none";
    });
  }

  if (checkoutModal) {
    checkoutModal.addEventListener("click", (e) => {
      if (e.target === checkoutModal) {
        checkoutModal.style.display = "none";
      }
    });
  }

  // document click handlers for cart controls
  document.addEventListener("click", (e) => {
    const addBtn = e.target.closest && e.target.closest(".btn-add");
    if (addBtn) {
      if (addBtn.id === "modalAddBtn") {
        addToCartFromModal();
        return;
      }
      const id = addBtn.dataset?.id;
      if (id) addToCartById(id);
      return;
    }

    const inc = e.target.closest && e.target.closest(".qty-increase");
    if (inc) {
      changeQty(inc.dataset.id, +1);
      return;
    }

    const dec = e.target.closest && e.target.closest(".qty-decrease");
    if (dec) {
      changeQty(dec.dataset.id, -1);
      return;
    }

    const rem = e.target.closest && e.target.closest(".remove-item");
    if (rem) {
      removeFromCart(rem.dataset.id);
      return;
    }
  });

  // checkout form sending
  if (checkoutForm) {
    checkoutForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const currentCart = cart.slice();
      if (!currentCart.length) {
        alert("Кошик порожній");
        return;
      }

      const formData = new FormData(checkoutForm);
      const data = {
        name: formData.get("name"),
        address: formData.get("address"),
        email: formData.get("email"),
        cart: JSON.stringify(currentCart, null, 2),
        total: cartTotalEl ? cartTotalEl.textContent : "",
      };

      try {
        const resp = await fetch("/order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        });

        const json = await resp.json();
        if (json && json.success) {
          alert("Дякуємо! Замовлення відправлено.");
          cart = [];
          updateCartUI();
          checkoutModal.style.display = "none";
        } else {
          console.error("Order error:", json);
          alert("Помилка при відправці замовлення.");
        }
      } catch (err) {
        console.error("Fetch /order error:", err);
        alert("Помилка при відправці замовлення.");
      }
    });
  }

  // expose api
  window.shopCart = {
    addToCartById,
    addToCartFromModal,
    removeFromCart,
    clearCart,
    getCart: () => cart.slice(),
    updateCartUI,
  };
});

// checkout.js
const checkoutModal = document.getElementById("checkoutModal");
const checkoutForm = document.getElementById("checkoutForm");
const checkoutClose = document.getElementById("checkoutClose");
const checkoutBtn = document.getElementById("checkoutBtn");
const cartTotalEl = document.getElementById("cartTotal");

let cart = window.cart || []; // глобальная корзина

// открыть модалку
if (checkoutBtn) {
  checkoutBtn.addEventListener("click", () => {
    cart = window.cart || [];
    if (!cart.length) return alert("Кошик порожній");
    checkoutModal.style.display = "flex";
  });
}

if (checkoutClose) {
  checkoutClose.addEventListener("click", () => {
    checkoutModal.style.display = "none";
  });
}

// отправка формы
if (checkoutForm) {
  checkoutForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    cart = window.cart || [];

    if (!cart.length) return alert("Кошик порожній");

    const formData = new FormData(checkoutForm);
    const data = {
      name: formData.get("name"),
      address: formData.get("address"),
      email: formData.get("email"),
      cart: JSON.stringify(cart, null, 2),
      total: cartTotalEl ? cartTotalEl.textContent : "",
    };

    try {
      // Отправляем на относительный путь /order — сервер сам в той же доменной зоне
      const resp = await fetch("/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const json = await resp.json();
      if (json && json.success) {
        alert("Дякуємо! Замовлення відправлено.");
        // очищаем глобальную корзину
        if (Array.isArray(window.cart)) window.cart.length = 0;
        // обновляем UI — функция должна существовать в cart.js
        if (typeof window.updateCartUI === "function") window.updateCartUI();
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

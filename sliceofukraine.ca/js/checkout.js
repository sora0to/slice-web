const checkoutModal = document.getElementById("checkoutModal");
const checkoutForm = document.getElementById("checkoutForm");
const checkoutClose = document.getElementById("checkoutClose");
const checkoutBtn = document.getElementById("checkoutBtn");
const cartTotalEl = document.getElementById("cartTotal");

let cart = window.cart || []; // глобальная корзина из cart.js

// открыть модалку
if (checkoutBtn) {
  checkoutBtn.addEventListener("click", () => {
    if (!cart.length) return alert("Кошик порожній");
    checkoutModal.style.display = "flex";
  });
}

// закрыть
checkoutClose.addEventListener("click", () => {
  checkoutModal.style.display = "none";
});

// отправка формы
checkoutForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const formData = new FormData(checkoutForm);
  const data = {
    name: formData.get("name"),
    address: formData.get("address"),
    email: formData.get("email"),
    cart: JSON.stringify(cart),
    total: cartTotalEl.textContent.replace(/\D+/g, "")
  };

  const resp = await fetch("http://localhost:3000/order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  }).then(r => r.json());

  if (resp.success) {
    alert("Дякуємо! Замовлення відправлено.");
    cart.length = 0;
    checkoutModal.style.display = "none";
    window.updateCartUI();
  } else {
    alert("Помилка при відправці замовлення.");
  }
});

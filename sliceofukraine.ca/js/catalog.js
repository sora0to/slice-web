// catalog.js — dynamic catalog page (no cart)
document.addEventListener("DOMContentLoaded", () => {
  const CATALOG_URL = "catalog.json";
  const PAGE_SIZE = 12;

  const catalogGrid = document.getElementById("catalogGrid");
  const loadMoreBtn = document.getElementById("loadMoreBtn");
  const searchInput = document.getElementById("searchInput");
  const categorySelect = document.getElementById("categorySelect");
  const sortSelect = document.getElementById("sortSelect");

  // Robust Header (burger + nav-close)
  const burger =
    document.getElementById("burger") || document.querySelector(".burger");
  let nav = null;
  if (burger) {
    const ctrl = burger.getAttribute("aria-controls");
    if (ctrl) nav = document.getElementById(ctrl);
    if (!nav) {
      const header = burger.closest("header");
      if (header) nav = header.querySelector("nav");
    }
    if (!nav) nav = document.querySelector("nav");
  }

  function openMenu() {
    if (!nav || !burger) return;
    nav.classList.add("show");
    document.body.classList.add("menu-open");
    burger.classList.add("active");
    burger.setAttribute("aria-expanded", "true");
    nav.setAttribute("aria-hidden", "false");
  }
  function closeMenu() {
    if (!nav || !burger) return;
    nav.classList.remove("show");
    document.body.classList.remove("menu-open");
    burger.classList.remove("active");
    burger.setAttribute("aria-expanded", "false");
    nav.setAttribute("aria-hidden", "true");
  }
  if (burger && nav) {
    burger.addEventListener("click", (e) => {
      e.stopPropagation();
      nav.classList.contains("show") ? closeMenu() : openMenu();
    });
    const navClose = nav.querySelector(".nav-close");
    if (navClose)
      navClose.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
      });
    nav
      .querySelectorAll("a")
      .forEach((a) => a.addEventListener("click", () => closeMenu()));
    document.addEventListener("click", (e) => {
      if (!nav.classList.contains("show")) return;
      if (!nav.contains(e.target) && !burger.contains(e.target)) closeMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 769) closeMenu();
    });
  }

  // modal elements
  const productModal = document.getElementById("productModal");
  const modalImage = document.getElementById("modalImage");
  const modalTitle = document.getElementById("modalTitle");
  const modalDesc = document.getElementById("modalDesc");
  const modalPrice = document.getElementById("modalPrice");
  const modalClose = document.getElementById("modalClose");
  const modalCloseBtn = document.getElementById("modalCloseBtn");

  let allProducts = [];
  let filtered = [];
  let page = 0;
  let currentLang = "uk";

  const FALLBACK = [
    {
      id: 1,
      title_uk: "Цукерки Рошен «Червоний мак»",
      title_en: "Roshen candies 'Red Poppy'",
      price: "12",
      img: "photo_2025-08-29_18-48-14.jpg",
      desc_uk: "Класичні шоколадні цукерки з начинкою у червоній обгортці.",
      desc_en: "Classic chocolate candies with filling in red wrapper.",
      category: "sweets",
    },
    {
      id: 2,
      title_uk: "Цукерки Рошен «Сливки-ленивки»",
      title_en: "Roshen candies 'Lazy Creams'",
      price: "14",
      img: "photo_2025-08-29_18-48-14.jpg",
      desc_uk: "Цукерки з молочно-вершковою начинкою у фіолетовій обгортці.",
      desc_en: "Candies with milk-cream filling in purple wrapper.",
      category: "sweets",
    },
    {
      id: 3,
      title_uk: "Цукерки «Зелена роща»",
      title_en: "Candies 'Green Grove'",
      price: "4",
      img: "photo_2025-08-29_18-48-14.jpg",
      desc_uk: "Шоколадні цукерки з начинкою у зеленій обгортці.",
      desc_en: "Chocolate candies with filling in green wrapper.",
      category: "sweets",
    },
    {
      id: 4,
      title_uk: "Цукерки «Коровка»",
      title_en: "Candies 'Korovka'",
      price: "8",
      img: "photo_2025-08-29_18-48-14.jpg",
      desc_uk: "Класичні іриски з молочним смаком у жовтій обгортці.",
      desc_en: "Classic toffee candies with milk flavor in yellow wrapper.",
      category: "sweets",
    },
    {
      id: 5,
      title_uk: "Цукерки «Ромашка»",
      title_en: "Candies 'Chamomile'",
      price: "9",
      img: "photo_2025-08-29_18-48-14.jpg",
      desc_uk: "Цукерки з начинкою у біло-фіолетовій обгортці.",
      desc_en: "Candies with filling in white-purple wrapper.",
      category: "sweets",
    },
    {
      id: 6,
      title_uk: "Цукерки «М’ятна»",
      title_en: "Candies 'Mint'",
      price: "",
      img: "photo_2025-08-29_18-48-14.jpg",
      desc_uk: "Цукерки з м’ятною начинкою у біло-зеленій обгортці.",
      desc_en: "Candies with mint filling in white-green wrapper.",
      category: "sweets",
    },
    {
      id: 7,
      title_uk: "Цукерки з фруктовою начинкою (зелені)",
      title_en: "Fruit candies (green)",
      price: "",
      img: "photo_2025-08-29_18-48-14.jpg",
      desc_uk: "Фруктові цукерки у зелених обгортках.",
      desc_en: "Fruit candies in green wrappers.",
      category: "sweets",
    },
    {
      id: 8,
      title_uk: "Цукерки з карамеллю (біло-зелені)",
      title_en: "Caramel candies (white-green)",
      price: "",
      img: "photo_2025-08-29_18-48-14.jpg",
      desc_uk: "Карамельні цукерки у біло-зелених обгортках.",
      desc_en: "Caramel candies in white-green wrappers.",
      category: "sweets",
    },
    {
      id: 9,
      title_uk: "Квас світлий",
      title_en: "White Kvas",
      price: "",
      img: "photo_2025-08-29_18-48-14.jpg",
      desc_uk: "Освітлений квас у золотистій банці.",
      desc_en: "Light kvass in golden can.",
      category: "drinks",
    },
    {
      id: 10,
      title_uk: "Квас темний",
      title_en: "Dark Kvas",
      price: "",
      img: "photo_2025-08-29_18-48-14.jpg",
      desc_uk: "Темний квас у чорній банці.",
      desc_en: "Dark kvass in black can.",
      category: "drinks",
    },
  ];

  function esc(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/"/g, "&quot;");
  }
  function createCard(p) {
    const div = document.createElement("div");
    div.className = "product";
    div.dataset.index = p.id || 0;
    div.innerHTML = `
    <img loading="lazy" src="${esc(p.img)}" alt="${esc(p.title_uk)}">
    <h3 data-uk="${esc(p.title_uk)}" data-en="${esc(p.title_en)}">${
      p.title_uk
    }</h3>
    <p class="price">$${esc(p.price)}</p>
    <p class="desc" data-uk="${esc(p.desc_uk)}" data-en="${esc(p.desc_en)}">${
      p.desc_uk || ""
    }</p>
    <div style="display:flex;gap:8px;justify-content:center;margin:12px 0;">
      <button class="btn-detail" data-id="${
        p.id
      }" data-uk="Деталі" data-en="Details" style="padding:8px 10px;border-radius:8px;border:1px solid #ddd;background:#fff;cursor:pointer">Деталі</button>
      <button class="btn-add" data-id="${
        p.id
      }" aria-label="Add to cart" data-uk="В корзину" data-en="To cart" style="padding:8px 10px;border-radius:8px;border:1px solid #ddd;background:var(--accent);font-weight:700;cursor:pointer">В корзину</button>
    </div>
  `;
    return div;
  }

  async function loadCatalogData() {
    try {
      const res = await fetch(CATALOG_URL, { cache: "no-store" });
      if (!res.ok) throw new Error("no json");
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) throw new Error("empty");
      return data;
    } catch (err) {
      console.warn("catalog.json not found or invalid, using fallback data");
      return FALLBACK;
    }
  }

  function populateCategories(list) {
    const cats = Array.from(
      new Set(list.map((p) => (p.category || "").toLowerCase()).filter(Boolean))
    );
    categorySelect.innerHTML =
      '<option value="" data-uk="Усі категорії" data-en="All categories">Усі категорії</option>';
    cats.forEach((c) => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c.charAt(0).toUpperCase() + c.slice(1);
      categorySelect.appendChild(opt);
    });
  }

  function applyFilters() {
    const q = (searchInput.value || "").trim().toLowerCase();
    const cat = (categorySelect.value || "").toLowerCase();
    const sort = sortSelect.value || "default";

    filtered = allProducts.filter((p) => {
      const matchesCat = !cat || (p.category || "").toLowerCase() === cat;
      const combined = `${p.title_en || ""} ${p.title_uk || ""} ${
        p.desc_en || ""
      } ${p.desc_uk || ""}`.toLowerCase();
      const matchesQ = !q || combined.includes(q);
      return matchesCat && matchesQ;
    });

    if (sort === "price-asc")
      filtered.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    if (sort === "price-desc")
      filtered.sort((a, b) => parseFloat(b.price) - parseFloat(a.price));
    if (sort === "title-asc")
      filtered.sort((a, b) =>
        (a.title_en || "").localeCompare(b.title_en || "")
      );
    if (sort === "title-desc")
      filtered.sort((a, b) =>
        (b.title_en || "").localeCompare(a.title_en || "")
      );

    page = 0;
    catalogGrid.innerHTML = "";
    renderPage();
  }

  function renderPage() {
    const start = page * PAGE_SIZE;
    const chunk = filtered.slice(start, start + PAGE_SIZE);
    chunk.forEach((p) => {
      const card = createCard(p);
      catalogGrid.appendChild(card);
    });
    page++;
    attachProductHandlers();
    applyRevealForNew();
    if (page * PAGE_SIZE >= filtered.length) loadMoreBtn.style.display = "none";
    else loadMoreBtn.style.display = "inline-block";
  }

  function attachProductHandlers() {
    catalogGrid.querySelectorAll(".btn-detail").forEach((btn) => {
      if (btn._bound) return;
      btn._bound = true;
      btn.addEventListener("click", () => {
        const id = parseInt(btn.dataset.id, 10);
        const prod = allProducts.find((x) => x.id === id);
        if (!prod) return;
        openModal(prod);
      });
    });
    catalogGrid.querySelectorAll(".btn-add").forEach((btn) => {
      if (btn._bound) return;
      btn._bound = true;

      btn.addEventListener("click", () => {
        const id = parseInt(btn.dataset.id, 10);
        const prod = allProducts.find((x) => x.id === id);
        if (!prod) return;

        btn.classList.remove("animate");
        void btn.offsetWidth; // перезапуск анимации
        btn.classList.add("animate");

        addToCart({
          title: prod.title_uk,
          price: prod.price,
          id: prod.id,
        });
      });
    });
  }

  function applyRevealForNew() {
    const nodes = Array.from(catalogGrid.querySelectorAll(".product")).filter(
      (n) => !n.classList.contains("show")
    );
    if ("IntersectionObserver" in window && nodes.length) {
      const obs = new IntersectionObserver(
        (entries, o) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const el = entry.target;
              const idx = parseInt(el.dataset.index || "0", 10);
              el.style.transitionDelay = `${Math.min(0.6, (idx % 12) * 0.06)}s`;
              el.classList.add("show");
              o.unobserve(el);
            }
          });
        },
        { threshold: 0.12 }
      );
      nodes.forEach((n) => {
        n.classList.add("hide");
        obs.observe(n);
      });
    } else {
      nodes.forEach((n) => n.classList.add("show"));
    }
  }

  /* Modal logic (details only) */
  function openModal(prod) {
    modalImage.style.backgroundImage = `url('${prod.img}')`;
    modalTitle.textContent =
      currentLang === "uk"
        ? prod.title_uk || prod.title_en
        : prod.title_en || prod.title_uk;
    modalDesc.textContent =
      currentLang === "uk" ? prod.desc_uk || "" : prod.desc_en || "";
    modalPrice.textContent = `$${prod.price}`;
    productModal.style.display = "block";
    productModal.setAttribute("aria-hidden", "false");
    modalClose.onclick = closeModal;
    if (modalCloseBtn) modalCloseBtn.onclick = closeModal;
    productModal.addEventListener("click", (e) => {
      if (e.target === productModal) closeModal();
    });
    document.addEventListener("keydown", escCloseModal);
  }
  function closeModal() {
    productModal.style.display = "none";
    productModal.setAttribute("aria-hidden", "true");
    document.removeEventListener("keydown", escCloseModal);
  }
  function escCloseModal(e) {
    if (e.key === "Escape") closeModal();
  }

  loadMoreBtn.addEventListener("click", () => {
    renderPage();
    setTimeout(() => {
      const last = catalogGrid.querySelector(".product:last-child");
      if (last) last.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 120);
  });

  let searchTimer = null;
  searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(applyFilters, 220);
  });
  categorySelect.addEventListener("change", () => applyFilters());
  sortSelect.addEventListener("change", () => applyFilters());

  // header lang-toggle hookup
  const headerLangBtn = document.getElementById("lang-toggle");
  if (headerLangBtn) {
    headerLangBtn.addEventListener(
      "click",
      () => {
        // переключаем язык
        currentLang = currentLang === "uk" ? "en" : "uk";

        // обновляем контент на странице
        document.querySelectorAll("[data-uk]").forEach((n) => {
          n.style.transition = n.style.transition || "opacity .28s";
          n.style.opacity = "0";
        });
        setTimeout(() => {
          document.querySelectorAll("[data-uk]").forEach((n) => {
            const txt = n.getAttribute(`data-${currentLang}`);
            if (txt !== null) n.textContent = txt;
            n.style.opacity = "1";
          });
        }, 300);

        // обновляем текст кнопки (показываем язык для переключения)
        headerLangBtn.textContent = currentLang === "uk" ? "EN" : "UA";
        // обновляем aria-pressed
        headerLangBtn.setAttribute("aria-pressed", currentLang === "en");
      },
      { passive: true }
    );
  }

  (async function init() {
    catalogGrid.innerHTML = '<div class="loading">Завантаження...</div>';
    allProducts = await loadCatalogData();
    allProducts = allProducts.map((p, idx) => ({
      id: p.id || idx + 1,
      title_uk: p.title_uk || p.title_en || "Product " + (idx + 1),
      title_en: p.title_en || p.title_uk || "Product " + (idx + 1),
      price: (p.price || "0").toString(),
      img: p.img || "",
      desc_uk: p.desc_uk || "",
      desc_en: p.desc_en || "",
      category: p.category || "",
    }));
    populateCategories(allProducts);
    filtered = allProducts.slice();
    page = 0;
    catalogGrid.innerHTML = "";
    renderPage();
  })();

  window.__CATALOG = { allProducts, applyFilters };

  /* ---------- TO TOP button ---------- */
  const toTop = document.getElementById("toTop");

  // Появление кнопки при прокрутке
  window.addEventListener("scroll", () => {
    if (window.scrollY > 300) {
      toTop.classList.add("show");
    } else {
      toTop.classList.remove("show");
    }
  });

  // Плавная прокрутка наверх
  toTop.addEventListener("click", () => {
    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  });
  /* ========== CART MODAL (open / close) ========== */

  const cartBtn = document.getElementById("cartBtn");
  const cartModal = document.getElementById("cartModal");
  const cartClose = document.getElementById("cartClose");

  if (cartBtn) {
    cartBtn.addEventListener("click", () => {
      cartModal.style.display = "block";
    });
  }

  if (cartClose) {
    cartClose.addEventListener("click", () => {
      cartModal.style.display = "none";
    });
  }

  window.addEventListener("click", (e) => {
    if (e.target === cartModal) cartModal.style.display = "none";
  });
});
window.cart = [];

function updateCartUI() {
  const itemsEl = document.getElementById("cartItems");
  const totalEl = document.getElementById("cartTotal");

  itemsEl.innerHTML = "";
  let total = 0;

  window.cart.forEach((p, i) => {
    const div = document.createElement("div");
    div.classList.add("cart-item");
    div.innerHTML = `
      <span>${p.title}</span>
      <span>${p.price} ₴</span>
      <button onclick="removeFromCart(${i})">✕</button>
    `;
    total += parseFloat(p.price);
    itemsEl.appendChild(div);
  });

  totalEl.textContent = "Разом: " + total + " ₴";
  document.getElementById("cartCount").textContent = window.cart.length;
}

window.updateCartUI = updateCartUI;

function addToCart(product) {
  window.cart.push(product);
  updateCartUI();
}

function removeFromCart(i) {
  window.cart.splice(i, 1);
  updateCartUI();
}

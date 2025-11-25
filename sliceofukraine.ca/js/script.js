// script.js — DOM-ready main logic for index.html (no cart)
document.addEventListener("DOMContentLoaded", () => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  /* ---------- Robust BURGER MENU + close button ---------- */
  const burger = $("#burger");
  let nav = document.getElementById("nav");
  if (!nav && burger) {
    const ctrl = burger.getAttribute("aria-controls");
    if (ctrl) nav = document.getElementById(ctrl);
    if (!nav)
      nav =
        document.querySelector("header nav") || document.querySelector("nav");
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

    const navCloseBtn = nav.querySelector(".nav-close");
    if (navCloseBtn)
      navCloseBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeMenu();
      });

    // close when clicking a link
    nav
      .querySelectorAll("a")
      .forEach((a) => a.addEventListener("click", closeMenu));

    // close clicking outside
    document.addEventListener("click", (e) => {
      if (!nav.classList.contains("show")) return;
      if (!nav.contains(e.target) && !burger.contains(e.target)) closeMenu();
    });

    // escape key
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMenu();
    });

    // resize
    window.addEventListener("resize", () => {
      if (window.innerWidth >= 769) closeMenu();
    });
  }

  /* ---------- LANGUAGE TOGGLE (fade) ---------- */
  const langToggle = $("#lang-toggle");
  let currentLang = "uk";
  if (langToggle) langToggle.textContent = currentLang === "uk" ? "EN" : "UA";

  function setLanguage(lang) {
    currentLang = lang;
    if (langToggle) langToggle.textContent = currentLang === "uk" ? "EN" : "UA";
    const nodes = $$("[data-uk]");
    nodes.forEach((n) => {
      n.style.transition = n.style.transition || "opacity .28s";
      n.style.opacity = "0";
    });
    setTimeout(() => {
      nodes.forEach((n) => {
        const txt = n.getAttribute(`data-${currentLang}`);
        if (txt !== null) n.textContent = txt;
        n.style.opacity = "1";
      });
    }, 300);
  }
  if (langToggle)
    langToggle.addEventListener("click", () =>
      setLanguage(currentLang === "uk" ? "en" : "uk")
    );

  /* ---------- HERO SLIDER ---------- */
  const slides = $$(".slide");
  const dots = $$(".dot");
  const prevBtn = $(".prev");
  const nextBtn = $(".next");
  let slideIndex = 0;
  let slideInterval = null;
  const SLIDE_TIME = 5000;

  function showSlide(index) {
    if (!slides.length) return;
    slideIndex = (index + slides.length) % slides.length;
    slides.forEach((s, i) => s.classList.toggle("active", i === slideIndex));
    dots.forEach((d, i) => d.classList.toggle("active", i === slideIndex));
  }
  function startSlider() {
    stopSlider();
    slideInterval = setInterval(() => showSlide(slideIndex + 1), SLIDE_TIME);
  }
  function stopSlider() {
    if (slideInterval) {
      clearInterval(slideInterval);
      slideInterval = null;
    }
  }
  function resetSlider() {
    stopSlider();
    startSlider();
  }

  showSlide(0);
  startSlider();

  prevBtn?.addEventListener("click", () => {
    showSlide(slideIndex - 1);
    resetSlider();
  });
  nextBtn?.addEventListener("click", () => {
    showSlide(slideIndex + 1);
    resetSlider();
  });
  dots.forEach((dot) =>
    dot.addEventListener("click", (e) => {
      const idx = parseInt(e.currentTarget.dataset.index, 10);
      if (!Number.isNaN(idx)) {
        showSlide(idx);
        resetSlider();
      }
    })
  );

  /* ---------- PARALLAX (throttled via rAF) ---------- */
  const heroContent = document.querySelector(".hero-content");
  const parallaxSections = $$(".parallax-section");
  let latestKnownScrollY = 0,
    ticking = false;
  function onScroll() {
    latestKnownScrollY = window.scrollY || window.pageYOffset;
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const scrollY = latestKnownScrollY;
        if (heroContent) {
          const offset = Math.max(0, scrollY - 40);
          heroContent.style.transform = `translateY(${Math.max(
            -20,
            Math.min(40, offset * 0.08)
          )}px)`;
        }
        slides.forEach((s) => {
          s.style.backgroundPosition = `center ${Math.round(scrollY * 0.15)}px`;
        });
        parallaxSections.forEach((sec) => {
          const bg = sec.querySelector(".parallax-bg");
          if (!bg) return;
          const rect = sec.getBoundingClientRect();
          const speed = parseFloat(sec.dataset.parallaxSpeed || 0.08);
          const shift = (window.innerHeight - rect.top) * speed;
          const maxShift =
            parseFloat(
              getComputedStyle(document.documentElement).getPropertyValue(
                "--parallax-max"
              )
            ) || 60;
          const y = Math.max(
            -maxShift,
            Math.min(maxShift, shift - maxShift / 2)
          );
          bg.style.transform = `translateY(${y}px)`;
        });
        ticking = false;
      });
      ticking = true;
    }
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  onScroll();

async function loadCarousel() {
  const track = document.getElementById("carouselTrack");

  const response = await fetch("catalog.json");
  const products = await response.json();

  // Рендерим карточки
  function createItem(product) {
    return `
      <div class="carousel-item">
        <img src="${product.img}" alt="${product.title_uk}">
        <div class="info">
          <div class="title">${product.title_uk}</div>
          <div class="price">${product.price} CAD</div>
        </div>
      </div>
    `;
  }

  // 1. Добавляем оригинальный список
  products.forEach(p => {
    track.insertAdjacentHTML("beforeend", createItem(p));
  });

  // 2. Дублируем список для бесконечности
  products.forEach(p => {
    track.insertAdjacentHTML("beforeend", createItem(p));
  });

  let position = 0;

  function autoScroll() {
    position -= 1; // скорость (px)
    track.style.transform = `translateX(${position}px)`;

    // если половина прокручена — сбрасываем (бесконечность)
    const itemWidth = 240; // карточка (220) + gap (20)
    const fullWidth = products.length * itemWidth;

    if (Math.abs(position) >= fullWidth) {
      position = 0;
      track.style.transform = "translateX(0px)";
    }

    requestAnimationFrame(autoScroll);
  }

  autoScroll();
}

loadCarousel();
  
  /* ---------- Reveal on scroll (IntersectionObserver) ---------- */
  const reveals = $$(".fade-section");
  if ("IntersectionObserver" in window && reveals.length) {
    const observer = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("show");
            obs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15 }
    );
    reveals.forEach((el) => observer.observe(el));
  } else {
    reveals.forEach((el) => el.classList.add("show"));
  }

  /* ---------- Products reveal (stagger) ---------- */
  const products = $$(".product");
  if ("IntersectionObserver" in window && products.length) {
    const obsP = new IntersectionObserver(
      (entries, obs) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const el = entry.target;
            const idx = parseInt(el.dataset.index || "0", 10);
            el.style.transitionDelay = `${Math.min(0.5, idx * 0.06)}s`;
            el.classList.add("show");
            obs.unobserve(el);
          }
        });
      },
      { threshold: 0.18 }
    );
    products.forEach((p) => {
      p.classList.add("hide");
      obsP.observe(p);
    });
  } else {
    products.forEach((p) => p.classList.add("show"));
  }

  /* ---------- TO TOP button ---------- */
  const toTop = document.getElementById("toTop");

  if (toTop) {
    // Ищем контейнер с прокруткой
    let scrollContainer = window;
    const testEls = document.querySelectorAll(
      "main, .catalog_inner, .content, .page, .scroll-container"
    );
    for (const el of testEls) {
      if (el && el.scrollHeight > el.clientHeight + 10) {
        scrollContainer = el;
        break;
      }
    }

    // Слушаем правильный элемент
    (scrollContainer === window ? window : scrollContainer).addEventListener(
      "scroll",
      () => {
        const scrollTop =
          scrollContainer === window
            ? document.documentElement.scrollTop || window.scrollY || 0
            : scrollContainer.scrollTop;

        if (scrollTop > 300) toTop.classList.add("show");
        else toTop.classList.remove("show");
      }
    );

    // Кнопка наверх
    toTop.addEventListener("click", () => {
      if (scrollContainer === window) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        scrollContainer.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  }

  /* ---------- Accessibility: close menu on Escape globally ---------- */
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (nav && nav.classList.contains("show")) closeMenu();
    }
  });

  // ensure parallax positions correct after load
  window.addEventListener("load", onScroll);
});

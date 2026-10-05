/* پورتفولیو مریم رافتی — تعامل‌های سبک */
(function () {
  "use strict";

  /* ---- سایهٔ هدر هنگام اسکرول ---- */
  var header = document.getElementById("siteHeader");
  if (header) {
    var onScroll = function () {
      header.classList.toggle("is-stuck", window.scrollY > 8);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  /* ---- ظهور تدریجی بخش‌ها ---- */
  var revealables = document.querySelectorAll(".reveal");
  if (revealables.length) {
    if (!("IntersectionObserver" in window) ||
        window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      revealables.forEach(function (el) { el.classList.add("is-visible"); });
    } else {
      var revealObserver = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            revealObserver.unobserve(entry.target);
          }
        });
      }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
      revealables.forEach(function (el) { revealObserver.observe(el); });
    }
  }

  /* ---- پررنگ‌کردن بخش جاری در ناوبری و فهرست کیس‌استادی ---- */
  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll('.nav-links a[href^="#"], .cs-toc a[href^="#"]')
  );
  if (navLinks.length && "IntersectionObserver" in window) {
    var targets = navLinks
      .map(function (link) { return document.querySelector(link.getAttribute("href")); })
      .filter(Boolean);

    var setActive = function (id) {
      navLinks.forEach(function (link) {
        link.classList.toggle("is-active", link.getAttribute("href") === "#" + id);
      });
    };

    var visible = new Map();
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) visible.set(entry.target.id, entry.intersectionRatio);
        else visible.delete(entry.target.id);
      });
      if (!visible.size) return;
      var best = null, bestTop = Infinity;
      visible.forEach(function (_, id) {
        var top = document.getElementById(id).getBoundingClientRect().top;
        if (Math.abs(top) < bestTop) { bestTop = Math.abs(top); best = id; }
      });
      if (best) setActive(best);
    }, { rootMargin: "-20% 0px -65% 0px", threshold: [0, 0.25, 0.6] });

    targets.forEach(function (el) { sectionObserver.observe(el); });
  }
})();

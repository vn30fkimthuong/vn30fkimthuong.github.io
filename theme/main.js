/* VN30F Kim Thương - main.js */
(function () {
  'use strict';

  var header = document.querySelector('header');
  var toggle = document.getElementById('tog');
  var nav = document.querySelector('nav');

  /* Đổ bóng cho header khi cuộn trang */
  function onScroll() {
    if (!header) return;
    header.classList.toggle('scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* Menu mobile: đóng menu khi bấm link, bấm ra ngoài hoặc nhấn Esc */
  function closeMenu() {
    if (toggle && toggle.checked) toggle.checked = false;
  }
  if (nav) {
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeMenu();
    });
  }
  document.addEventListener('click', function (e) {
    if (toggle && toggle.checked && !e.target.closest('header')) closeMenu();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeMenu();
  });
  window.addEventListener('resize', function () {
    if (window.innerWidth > 900) closeMenu();
  });

  /* FAQ: mở một câu thì các câu khác trong cùng nhóm tự đóng lại */
  var items = document.querySelectorAll('details');
  items.forEach(function (d) {
    d.addEventListener('toggle', function () {
      if (!d.open || !d.parentElement) return;
      d.parentElement.querySelectorAll(':scope > details').forEach(function (o) {
        if (o !== d) o.open = false;
      });
    });
  });

  /* Hiệu ứng hiện dần khi cuộn tới từng khối */
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if ('IntersectionObserver' in window && !reduce) {
    var targets = document.querySelectorAll(
      '.title, .lead, .role, .k, .step, .store, .news-card, .slider, .app .wrap > div:not(.phone), details, .warn, .final .wrap'
    );
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    targets.forEach(function (el) {
      el.classList.add('reveal');
      io.observe(el);
    });
  }

  /* Slider giao diện ứng dụng: nút trước/sau, tự chuyển slide, dừng khi rê chuột */
  var track = document.querySelector('.track');
  if (track) {
    var slides = track.querySelectorAll('.slide');
    var prev = document.querySelector('.slider-prev');
    var next = document.querySelector('.slider-next');
    var timer = null;

    var stepWidth = function () {
      return slides.length ? slides[0].getBoundingClientRect().width + 19 : 300;
    };
    var go = function (dir) {
      var max = track.scrollWidth - track.clientWidth;
      if (dir > 0 && track.scrollLeft >= max - 4) {
        track.scrollTo({ left: 0, behavior: 'smooth' });
      } else if (dir < 0 && track.scrollLeft <= 4) {
        track.scrollTo({ left: max, behavior: 'smooth' });
      } else {
        track.scrollBy({ left: dir * stepWidth(), behavior: 'smooth' });
      }
    };
    var stop = function () { clearInterval(timer); timer = null; };
    var start = function () {
      if (reduce || timer) return;
      timer = setInterval(function () { go(1); }, 4500);
    };

    if (prev) prev.addEventListener('click', function () { go(-1); });
    if (next) next.addEventListener('click', function () { go(1); });
    ['mouseenter', 'focusin', 'touchstart'].forEach(function (ev) {
      track.addEventListener(ev, stop, { passive: true });
    });
    ['mouseleave', 'focusout', 'touchend'].forEach(function (ev) {
      track.addEventListener(ev, start, { passive: true });
    });
    [prev, next].forEach(function (b) {
      if (!b) return;
      b.addEventListener('mouseenter', stop);
      b.addEventListener('mouseleave', start);
    });
    start();
  }
})();

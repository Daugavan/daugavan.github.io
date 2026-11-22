(function () {
  'use strict';

  var motionPreference = window.matchMedia('(prefers-reduced-motion: reduce)');
  var prefersReducedMotion = motionPreference.matches;
  var solidPreference = window.matchMedia('(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)');

  function syncSolidPreference() {
    document.documentElement.classList.toggle('glass-solid', solidPreference.matches);
  }
  syncSolidPreference();
  solidPreference.addEventListener('change', syncSolidPreference);

  function glassEnabled() {
    return document.documentElement.dataset.glass !== 'off' && !solidPreference.matches;
  }

  motionPreference.addEventListener('change', function (event) {
    prefersReducedMotion = event.matches;
    if (event.matches) document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach(function (el) {
      el.classList.add('visible');
    });
  });

  document.addEventListener('DOMContentLoaded', function () {
    initGlassPreference();
    initGlassLens();
    initScrollReveal();
    initHeaderBehavior();
    initHeroParallax();
    initMobileMenu();
    initFormValidation();
    initMenuSpy();
    initMinDate();
  });


  function initGlassPreference() {
    var root = document.documentElement;
    var buttons = document.querySelectorAll('.glass-toggle');
    function update() {
      var enabled = root.dataset.glass !== 'off';
      buttons.forEach(function (button) {
        button.hidden = false;
        button.setAttribute('aria-checked', String(enabled));
        button.querySelector('.glass-toggle-state').textContent = enabled ? 'På' : 'Av';
      });
    }
    buttons.forEach(function (button) {
      button.addEventListener('click', function () {
        root.dataset.glass = root.dataset.glass === 'off' ? 'on' : 'off';
        try { localStorage.setItem('coco-glass', root.dataset.glass); } catch (error) { /* Optional persistence. */ }
        update();
      });
    });
    window.addEventListener('storage', function (event) {
      if (event.key !== 'coco-glass' && event.key !== null) return;
      root.dataset.glass = event.newValue === 'off' ? 'off' : 'on';
      update();
    });
    update();
  }

  function initGlassLens() {
    var title = document.getElementById('hero-title');
    if (!title || !window.CSS || !CSS.supports('mask-image', 'radial-gradient(black, transparent)')) return;
    var wrapper = document.createElement('div');
    wrapper.className = 'glass-title-wrap';
    title.parentNode.insertBefore(wrapper, title);
    wrapper.appendChild(title);
    var lens = document.createElement('div');
    lens.className = 'glass-lens';
    lens.setAttribute('aria-hidden', 'true');
    lens.setAttribute('inert', '');
    var copy = document.createElement('div');
    copy.className = 'hero-title glass-lens-copy';
    Array.prototype.forEach.call(title.childNodes, function (node) {
      copy.appendChild(node.cloneNode(true));
    });
    var optics = document.createElement('div');
    optics.className = 'glass-lens-optics';
    optics.appendChild(copy);
    lens.appendChild(optics);
    wrapper.appendChild(lens);

    var motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    var pointer = window.matchMedia('(hover: hover) and (pointer: fine)');
    var scale = 1.45;
    var home = { x: 0, y: 0 };
    var frame = 0;
    var pendingPoint = null;
    var current = { x: 0, y: 0 };
    var radius = 20;
    var titleWidth = 0;
    var titleHeight = 0;
    var titleLeft = 0;
    var titleTop = 0;
    var refractionSize = 0;

    // Distort only the decorative text copy, never the document or photograph.
    // The neutral centre and smooth annular map avoid noisy turbulence.
    var svgNS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNS, 'svg');
    svg.classList.add('glass-filter-defs');
    svg.setAttribute('aria-hidden', 'true');
    var filter = document.createElementNS(svgNS, 'filter');
    filter.id = 'coco-lens-refraction';
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    var mapImage = document.createElementNS(svgNS, 'feImage');
    mapImage.setAttribute('result', 'edge-map');
    mapImage.setAttribute('preserveAspectRatio', 'none');
    var displacement = document.createElementNS(svgNS, 'feDisplacementMap');
    displacement.setAttribute('in', 'SourceGraphic');
    displacement.setAttribute('in2', 'edge-map');
    displacement.setAttribute('xChannelSelector', 'R');
    displacement.setAttribute('yChannelSelector', 'G');
    filter.appendChild(mapImage);
    filter.appendChild(displacement);
    svg.appendChild(filter);
    wrapper.appendChild(svg);

    function updateRefraction(diameter) {
      if (refractionSize === diameter) return;
      try {
        var canvas = document.createElement('canvas');
        var samples = 256;
        canvas.width = canvas.height = samples;
        var context = canvas.getContext('2d');
        var data = context.createImageData(samples, samples);
        for (var row = 0; row < samples; row++) {
          for (var col = 0; col < samples; col++) {
            var dx = (col + 0.5) / samples * 2 - 1;
            var dy = (row + 0.5) / samples * 2 - 1;
            var distance = Math.sqrt(dx * dx + dy * dy);
            var strength = distance > 0.58 && distance < 1 ?
              Math.pow(Math.sin((distance - 0.58) / 0.42 * Math.PI), 2) : 0;
            var index = (row * samples + col) * 4;
            data.data[index] = 128 + dx * strength * 127;
            data.data[index + 1] = 128 + dy * strength * 127;
            data.data[index + 2] = 128;
            data.data[index + 3] = 255;
          }
        }
        context.putImageData(data, 0, 0);
        // Filter the text before its CSS transform: a small source region works
        // in WebKit too, without rasterizing the entire transformed heading.
        filter.setAttribute('width', diameter / scale);
        filter.setAttribute('height', diameter / scale);
        mapImage.setAttribute('width', diameter / scale);
        mapImage.setAttribute('height', diameter / scale);
        mapImage.setAttribute('href', canvas.toDataURL());
        displacement.setAttribute('scale', (diameter < 88 ? 6 : 12) / scale);
        copy.style.setProperty('--lens-filter', 'url(#coco-lens-refraction)');
        refractionSize = diameter;
      } catch (error) { copy.style.removeProperty('--lens-filter'); }
    }

    function draw(point) {
      // Keep the entire droplet inside the heading, even after text reflow.
      var x = Math.max(radius, Math.min(titleWidth - radius, point.x));
      var y = Math.max(radius, Math.min(titleHeight - radius, point.y));
      title.style.setProperty('--lens-x', x + 'px');
      title.style.setProperty('--lens-y', y + 'px');
      title.style.setProperty('--lens-r', radius + 'px');
      lens.style.left = (titleLeft + x - radius) + 'px';
      lens.style.top = (titleTop + y - radius) + 'px';
      var sourceX = x - radius / scale;
      var sourceY = y - radius / scale;
      filter.setAttribute('x', sourceX);
      filter.setAttribute('y', sourceY);
      mapImage.setAttribute('x', sourceX);
      mapImage.setAttribute('y', sourceY);
      current = { x: x, y: y };
      copy.style.transform = 'translate(' + (radius - x * scale) + 'px,' +
        (radius - y * scale) + 'px) scale(' + scale + ')';
    }

    function measure() {
      cancelAnimationFrame(frame);
      frame = 0;
      titleWidth = title.offsetWidth;
      titleHeight = title.offsetHeight;
      titleLeft = title.offsetLeft;
      titleTop = title.offsetTop;
      // Hidden lenses still have a computed CSS diameter.
      radius = parseFloat(getComputedStyle(lens).width) / 2;
      copy.style.width = titleWidth + 'px';
      updateRefraction(radius * 2);
      // Anchor to the actual glyph, rather than a viewport-dependent percentage.
      var text = title.firstChild;
      var offset = text && text.textContent.indexOf('ä');
      if (text && text.nodeType === 3 && offset >= 0) {
        var range = document.createRange();
        range.setStart(text, offset);
        range.setEnd(text, offset + 1);
        var glyph = range.getBoundingClientRect();
        var bounds = title.getBoundingClientRect();
        home = { x: glyph.left - bounds.left + glyph.width / 2,
          y: glyph.top - bounds.top + glyph.height / 2 };
      } else {
        home = { x: title.offsetWidth / 3, y: title.offsetHeight / 3 };
      }
      draw(home);
    }

    title.addEventListener('pointermove', function (event) {
      if (!pointer.matches || motion.matches || event.pointerType === 'touch' ||
          !glassEnabled()) return;
      pendingPoint = { x: event.clientX, y: event.clientY };
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(function () {
        frame = 0;
        var bounds = title.getBoundingClientRect();
        draw({ x: pendingPoint.x - bounds.left, y: pendingPoint.y - bounds.top });
      });
    });
    function reset() {
      cancelAnimationFrame(frame);
      frame = 0;
      if (motion.matches || !pointer.matches || !glassEnabled()) { draw(home); return; }
      var start = { x: current.x, y: current.y };
      var started = performance.now();
      function settle(now) {
        var progress = Math.min(1, (now - started) / 220);
        var eased = 1 - Math.pow(1 - progress, 3);
        draw({ x: start.x + (home.x - start.x) * eased,
          y: start.y + (home.y - start.y) * eased });
        frame = progress < 1 ? requestAnimationFrame(settle) : 0;
      }
      frame = requestAnimationFrame(settle);
    }
    title.addEventListener('pointerleave', reset);
    motion.addEventListener('change', reset);
    pointer.addEventListener('change', reset);
    solidPreference.addEventListener('change', reset);
    new MutationObserver(measure).observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-glass']
    });
    if ('ResizeObserver' in window) new ResizeObserver(measure).observe(title);
    else window.addEventListener('resize', measure);
    if (document.fonts) document.fonts.ready.then(measure);
    measure();
  }

  function initScrollReveal() {
    var reveals = document.querySelectorAll('.reveal, .reveal-left, .reveal-right');
    if (reveals.length === 0) return;

    if (!('IntersectionObserver' in window) || prefersReducedMotion) {
      reveals.forEach(function (el) { el.classList.add('visible'); });
      return;
    }

    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { root: null, rootMargin: '0px 0px -80px 0px', threshold: 0.1 });

    reveals.forEach(function (el) { observer.observe(el); });
  }

  function initHeaderBehavior() {
    var header = document.getElementById('header');
    if (!header) return;
    var root = document.documentElement;
    var lastScrollY = window.pageYOffset;
    var ticking = false;

    function measureHeader() {
      root.style.setProperty('--header-h', header.offsetHeight + 'px');
    }
    function showHeader() {
      header.classList.remove('hidden');
      // Do not re-mutate the observed root while the mobile menu is open.
      if (root.classList.contains('header-hidden')) root.classList.remove('header-hidden');
    }
    function updateHeader() {
      var scrollY = window.pageYOffset;
      header.classList.toggle('scrolled', scrollY > 60);
      var hide = scrollY > lastScrollY && scrollY > 400 &&
        !root.classList.contains('menu-open') && !header.contains(document.activeElement);
      if (scrollY !== lastScrollY) {
        header.classList.toggle('hidden', hide);
        root.classList.toggle('header-hidden', hide);
      }
      lastScrollY = scrollY;
      ticking = false;
    }
    measureHeader();
    if ('ResizeObserver' in window) new ResizeObserver(measureHeader).observe(header);
    else window.addEventListener('resize', measureHeader);
    header.addEventListener('focusin', showHeader);
    new MutationObserver(function () {
      if (root.classList.contains('menu-open')) showHeader();
    }).observe(root, { attributes: true, attributeFilter: ['class'] });
    window.addEventListener('scroll', function () {
      if (!ticking) { requestAnimationFrame(updateHeader); ticking = true; }
    }, { passive: true });
    updateHeader();
  }

  function initHeroParallax() {
    var heroMedia = document.querySelector('.hero-media');
    if (!heroMedia) return;

    var ticking = false;

    function updateParallax() {
      var scrollY = window.pageYOffset;
      var translateY = prefersReducedMotion || !glassEnabled() ? 0 : Math.min(scrollY * 0.15, 60);
      heroMedia.style.transform = 'translateY(' + translateY + 'px)';
      ticking = false;
    }

    motionPreference.addEventListener('change', updateParallax);
    solidPreference.addEventListener('change', updateParallax);
    new MutationObserver(updateParallax).observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-glass']
    });
    window.addEventListener('scroll', function () {
      if (prefersReducedMotion || !glassEnabled()) return;
      if (!ticking) {
        requestAnimationFrame(updateParallax);
        ticking = true;
      }
    }, { passive: true });
  }

  function initMobileMenu() {
    var menuToggle = document.getElementById('menu-toggle');
    var nav = document.getElementById('nav-menu');
    var backdrop = document.getElementById('nav-backdrop');
    if (!menuToggle || !nav) return;

    function openMenu() {
      menuToggle.setAttribute('aria-expanded', 'true');
      menuToggle.setAttribute('aria-label', 'Stäng meny');
      nav.classList.add('active');
      if (backdrop) backdrop.classList.add('active');
      document.documentElement.classList.add('menu-open');
      document.addEventListener('keydown', trapFocus);
      var firstLink = nav.querySelector('a');
      // Let the visibility change commit before moving focus into the drawer.
      requestAnimationFrame(function () {
        if (firstLink && isOpen()) firstLink.focus({ preventScroll: true });
      });
    }

    function closeMenu(restoreFocus) {
      menuToggle.setAttribute('aria-expanded', 'false');
      menuToggle.setAttribute('aria-label', 'Öppna meny');
      nav.classList.remove('active');
      if (backdrop) backdrop.classList.remove('active');
      document.documentElement.classList.remove('menu-open');
      document.removeEventListener('keydown', trapFocus);
      if (restoreFocus) menuToggle.focus();
    }

    function isOpen() {
      return nav.classList.contains('active');
    }

    function trapFocus(e) {
      if (e.key === 'Escape') {
        closeMenu(true);
        return;
      }
      if (e.key !== 'Tab') return;

      var focusables = [menuToggle].concat(
        Array.prototype.slice.call(nav.querySelectorAll('a'))
      );
      var first = focusables[0];
      var last = focusables[focusables.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    menuToggle.addEventListener('click', function () {
      if (isOpen()) {
        closeMenu(true);
      } else {
        openMenu();
      }
    });

    nav.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () { closeMenu(false); });
    });

    if (backdrop) {
      backdrop.addEventListener('click', function () { closeMenu(true); });
    }

    window.addEventListener('resize', function () {
      if (window.innerWidth > 768 && isOpen()) closeMenu(false);
    });
  }

  function initFormValidation() {
    var forms = document.querySelectorAll('form[data-validate]');

    forms.forEach(function (form) {
      form.addEventListener('input', function (e) {
        if (e.target.hasAttribute('aria-invalid')) {
          clearFieldError(e.target);
        }
      });

      form.addEventListener('submit', function (e) {
        e.preventDefault();

        if (!validateForm(form)) {
          showFormMessage(form, 'error', 'Kontrollera de markerade fälten och försök igen.');
          var firstInvalid = form.querySelector('[aria-invalid="true"]');
          if (firstInvalid) firstInvalid.focus();
          return;
        }

        var honeypot = form.querySelector('[name="company"]');
        if (honeypot && honeypot.value.trim() !== '') {
          showFormMessage(form, 'success', successMessage(form));
          form.reset();
          return;
        }

        window.location.href = buildMailtoUrl(form);
        showFormMessage(form, 'success', successMessage(form));
        form.reset();
      });
    });
  }

  function successMessage(form) {
    return form.getAttribute('data-success') ||
      'Din e-postklient öppnas nu med ditt ifyllda meddelande. Skicka mailet där för att slutföra.';
  }

  function buildMailtoUrl(form) {
    var recipient = (form.getAttribute('action') || '').replace(/^mailto:/i, '').split('?')[0] ||
      'info@cocothai.se';
    var subject = form.getAttribute('data-subject') || 'Meddelande via hemsidan';
    var lines = [];

    var fields = form.querySelectorAll('input[name], select[name], textarea[name]');
    fields.forEach(function (field) {
      if (field.name === 'company') return;
      var value = field.value.trim();
      if (!value) return;

      var label = field.name;
      if (field.id) {
        var labelEl = form.querySelector('label[for="' + field.id + '"]');
        if (labelEl) label = labelEl.textContent.replace(/\s*\*\s*$/, '').trim();
      }
      lines.push(label + ': ' + value);
    });

    return 'mailto:' + recipient +
      '?subject=' + encodeURIComponent(subject) +
      '&body=' + encodeURIComponent(lines.join('\n'));
  }

  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  function validateForm(form) {
    var isValid = true;
    var requiredFields = form.querySelectorAll('[required]');

    requiredFields.forEach(function (field) {
      var value = field.value.trim();
      var error = '';

      if (!value) {
        error = 'Detta fält måste fyllas i.';
      } else if (field.type === 'email' && !EMAIL_RE.test(value)) {
        error = 'Ange en giltig e-postadress.';
      }

      if (error) {
        isValid = false;
        setFieldError(field, error);
      } else {
        clearFieldError(field);
      }
    });

    return isValid;
  }

  function setFieldError(field, message) {
    field.setAttribute('aria-invalid', 'true');

    var errorId = field.id + '-error';
    var errorEl = document.getElementById(errorId);
    if (!errorEl) {
      errorEl = document.createElement('span');
      errorEl.id = errorId;
      errorEl.className = 'form-error';
      errorEl.setAttribute('role', 'alert');
      field.parentNode.appendChild(errorEl);
    }
    errorEl.textContent = message;
    field.setAttribute('aria-describedby', errorId);
  }

  function clearFieldError(field) {
    field.setAttribute('aria-invalid', 'false');
    field.removeAttribute('aria-describedby');
    var errorEl = document.getElementById(field.id + '-error');
    if (errorEl) errorEl.remove();
  }

  function showFormMessage(form, type, message) {
    var existing = form.querySelector('.form-message');
    if (existing) existing.remove();

    var messageEl = document.createElement('div');
    messageEl.className = 'form-message form-message--' + type;
    messageEl.setAttribute('role', 'status');
    messageEl.setAttribute('aria-live', 'polite');
    messageEl.textContent = message;

    form.insertBefore(messageEl, form.firstChild);

    if (type === 'success') {
      setTimeout(function () { messageEl.remove(); }, 12000);
    }
  }

  function initMenuSpy() {
    var links = document.querySelectorAll('.menu-nav-link');
    if (!links.length) return;
    var nav = document.querySelector('.menu-nav');
    var list = nav.querySelector('.menu-nav-list');
    var categories = [];
    links.forEach(function (link) {
      var section = document.getElementById(link.hash.slice(1));
      if (section) categories.push({ link: link, section: section });
    });
    if (!categories.length) return;
    var marker = document.createElement('li');
    marker.className = 'menu-nav-marker';
    marker.setAttribute('aria-hidden', 'true');
    marker.setAttribute('role', 'presentation');
    list.prepend(marker);
    nav.classList.add('has-marker');
    var activeLink = null;
    var animation = null;
    var pendingTarget = null;
    var frame = 0;
    var scrollTimer = 0;

    function positionMarker(animate) {
      if (!activeLink) return;
      var previous = marker.getBoundingClientRect();
      var box = activeLink.getBoundingClientRect();
      var bounds = list.getBoundingClientRect();
      var x = box.left - bounds.left + list.scrollLeft;
      var y = box.top - bounds.top + list.scrollTop;
      if (animation) animation.cancel();
      marker.style.width = box.width + 'px';
      marker.style.height = box.height + 'px';
      marker.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      if (animate && !prefersReducedMotion && glassEnabled() && marker.animate && previous.width) {
        animation = marker.animate([
          { transform: 'translate(' + (previous.left - bounds.left + list.scrollLeft) + 'px,' +
            (previous.top - bounds.top + list.scrollTop) + 'px) scaleX(' + (previous.width / box.width) + ')' },
          { transform: 'translate(' + x + 'px,' + y + 'px) scaleX(1)' }
        ], { duration: 220, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' });
      }
    }
    function keepVisible() {
      var box = activeLink.getBoundingClientRect();
      var bounds = list.getBoundingClientRect();
      var delta = box.left < bounds.left + 6 ? box.left - bounds.left - 6 :
        box.right > bounds.right - 6 ? box.right - bounds.right + 6 : 0;
      if (delta) list.scrollBy({ left: delta, behavior: 'instant' });
    }
    function setActive(link, animate) {
      if (activeLink === link) return;
      links.forEach(function (item) {
        item.classList.toggle('active', item === link);
        if (item === link) item.setAttribute('aria-current', 'location');
        else item.removeAttribute('aria-current');
      });
      activeLink = link;
      positionMarker(animate);
      keepVisible();
    }
    function fromHash() {
      return categories.find(function (item) { return item.link.hash === window.location.hash; });
    }
    function updateFromScroll() {
      frame = 0;
      if (pendingTarget) return;
      var threshold = Math.max(nav.getBoundingClientRect().bottom + 24, window.innerHeight * 0.32);
      var selected = categories[0];
      categories.forEach(function (item) {
        if (item.section.getBoundingClientRect().top <= threshold) selected = item;
      });
      setActive(selected.link, true);
    }
    function settleScroll() {
      clearTimeout(scrollTimer);
      pendingTarget = null;
      updateFromScroll();
    }
    function readHash() {
      var match = fromHash();
      if (match) { pendingTarget = match; setActive(match.link, true); }
      clearTimeout(scrollTimer);
      scrollTimer = setTimeout(settleScroll, 220);
    }
    links.forEach(function (link) {
      link.addEventListener('click', function (event) {
        if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        pendingTarget = link;
        setActive(link, true);
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(settleScroll, 220);
      });
      link.addEventListener('focus', function () {
        // Reveal focused destinations without changing the current category.
        var box = link.getBoundingClientRect();
        var bounds = list.getBoundingClientRect();
        if (box.left < bounds.left + 6) list.scrollLeft += box.left - bounds.left - 6;
        else if (box.right > bounds.right - 6) list.scrollLeft += box.right - bounds.right + 6;
      });
    });
    function remeasure() {
      document.documentElement.style.setProperty('--menu-nav-h', nav.offsetHeight + 'px');
      positionMarker(false);
    }
    setActive((fromHash() || categories[0]).link, false);
    if ('ResizeObserver' in window) {
      var observer = new ResizeObserver(remeasure);
      observer.observe(nav);
      links.forEach(function (link) { observer.observe(link); });
    } else window.addEventListener('resize', remeasure);
    if (document.fonts) document.fonts.ready.then(remeasure);
    window.addEventListener('hashchange', readHash);
    window.addEventListener('scroll', function () {
      if (!frame) frame = requestAnimationFrame(updateFromScroll);
      clearTimeout(scrollTimer);
      if (pendingTarget) scrollTimer = setTimeout(settleScroll, 160);
    }, { passive: true });
    window.addEventListener('scrollend', settleScroll);
    window.addEventListener('wheel', function () { pendingTarget = null; }, { passive: true });
    window.addEventListener('touchstart', function () { pendingTarget = null; }, { passive: true });
    function stopMotion() { positionMarker(false); }
    motionPreference.addEventListener('change', stopMotion);
    solidPreference.addEventListener('change', stopMotion);
    new MutationObserver(stopMotion).observe(document.documentElement, {
      attributes: true, attributeFilter: ['data-glass']
    });
    remeasure();
    requestAnimationFrame(updateFromScroll);
  }

  function initMinDate() {
    var today = new Date();
    var iso = today.getFullYear() + '-' +
      String(today.getMonth() + 1).padStart(2, '0') + '-' +
      String(today.getDate()).padStart(2, '0');

    document.querySelectorAll('input[type="date"]').forEach(function (input) {
      input.setAttribute('min', iso);
    });
  }
})();

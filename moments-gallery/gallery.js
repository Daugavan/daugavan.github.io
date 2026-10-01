/* Ögonblick: dependency-free progressive gallery enhancement. */
(() => {
  'use strict';
  const gallery = document.querySelector('[data-gallery]');
  if (!gallery) return;
  const wall = gallery.querySelector('.mg-wall');
  const viewport = gallery.querySelector('.mg-viewport');
  const dialog = gallery.querySelector('.mg-viewer');
  const data = JSON.parse(gallery.querySelector('.mg-data').textContent);
  const labels = {"en": {"brand": "Moments", "brandLabel": "Moments, back to gallery start", "skip": "Skip to photographs", "edition": "A PHOTOGRAPHIC COLLECTION", "viewport": "Photo gallery. Scroll for more photographs.", "photos": "Photographs", "eyebrow": "A WALL OF STORIES", "hint": "Follow your curiosity. Open a moment.", "grid": "Show grid", "wall": "Show photo wall", "light": "Switch to light theme", "dark": "Switch to dark theme", "theme": "Switch theme", "prev": "Previous photograph", "next": "Next photograph", "close": "Close image viewer", "error": "The image could not be loaded.", "retry": "Try again", "share": "Copy image link", "original": "Open image file", "missing": "Image unavailable", "open": "Open", "category": "Photography", "copied": "Image link copied.", "copy": "Copy the link:", "copyLabel": "Image link to copy", "publish": "Publish the gallery on the web to share image links."}, "sv": {"brand": "Ögonblick", "brandLabel": "Ögonblick, till galleriets början", "skip": "Till fotografierna", "edition": "EN FOTOGRAFISK SAMLING", "viewport": "Fotogalleri. Bläddra för fler bilder.", "photos": "Fotografier", "eyebrow": "EN VÄGG AV BERÄTTELSER", "hint": "Följ din nyfikenhet. Öppna ett ögonblick.", "grid": "Visa som rutnät", "wall": "Visa bildvägg", "light": "Växla till ljust tema", "dark": "Växla till mörkt tema", "theme": "Växla tema", "prev": "Föregående bild", "next": "Nästa bild", "close": "Stäng bildvisaren", "error": "Bilden kunde inte laddas.", "retry": "Försök igen", "share": "Kopiera bildlänk", "original": "Öppna bildfil", "missing": "Bild saknas", "open": "Öppna", "category": "Fotografi", "copied": "Bildlänken har kopierats.", "copy": "Kopiera länken:", "copyLabel": "Bildlänk att kopiera", "publish": "Publicera galleriet på webben för att dela bildlänkar."}};
  const englishPhotos = data.map(photo => ({ title: photo.title, alt: photo.alt }));
  let language = document.documentElement.lang.startsWith('sv') ? 'sv' : 'en';
  const text = key => labels[language][key];
  if (!data.length || typeof dialog.showModal !== 'function') return;
  const byId = new Map(data.map((photo, index) => [photo.id, { photo, index }]));
  const originals = [...wall.children];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const narrow = matchMedia('(max-width: 680px)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const styles = getComputedStyle(gallery);
  const config = {
    hoverScale: Number(styles.getPropertyValue('--mg-hover-scale')) || 2.65,
    repel: Number(styles.getPropertyValue('--mg-repel')) || 88,
    duration: Number(styles.getPropertyValue('--mg-motion-ms')) || 480,
    ease: styles.getPropertyValue('--mg-ease').trim() || 'cubic-bezier(.2,.8,.2,1)',
    maxTiles: 192,
    response: 15
  };
  let tiles = [], spatial = false, gridMode = false, active = null, pointer = null;
  let frame = 0, previousTime = 0, dirtyPointer = false, stageRect, resizeFrame = 0;
  let current = -1, selectedTile = null, returnFocus = null, serial = 0, closing = false;
  let flight = null, flightAnimation = null, openHole = null, lock = null;
  let baseHash = location.hash, ownsEntry = false, historyPending = false;
  let swipe = null;
  const feature = dialog.querySelector('.mg-feature-picture');
  const featureImg = dialog.querySelector('.mg-feature-image');
  const imageStage = dialog.querySelector('.mg-image-stage');
  const error = dialog.querySelector('.mg-viewer-error');
  const status = dialog.querySelector('.mg-status');
  const layoutButton = gallery.querySelector('.mg-layout');
  const motionDuration = () => reduced.matches ? 0 : config.duration;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const srcset = (photo, format, maxWidth = Infinity) => photo.variants[format]
    .filter(v => v.width <= maxWidth || v === photo.variants[format][0])
    .map(v => `${v.src} ${v.width}w`).join(', ');
  const onImageError = img => {
    const tile = img.closest('.mg-tile');
    if (!tile) return;
    tile.classList.add('is-broken');
    tile.querySelector('.mg-image-error').hidden = false;
  };
  wall.addEventListener('error', event => {
    if (event.target instanceof HTMLImageElement) onImageError(event.target);
  }, true);
  originals.forEach(tile => {
    const image = tile.querySelector('img');
    if (image.complete && !image.naturalWidth) onImageError(image);
  });
  gallery.querySelector('.mg-total').textContent = `${String(data.length).padStart(2, '0')} ${text('photos').toUpperCase()}`;
  gallery.querySelectorAll('.mg-theme').forEach(button => { button.hidden = false; });
  layoutButton.hidden = false;

  function setTheme(theme) {
    gallery.dataset.theme = theme;
    gallery.querySelectorAll('.mg-theme').forEach(button => {
      button.setAttribute('aria-label', text(theme === 'dark' ? 'light' : 'dark'));
    });
    try { localStorage.setItem('moments-theme', theme); } catch { /* Storage can be disabled. */ }
  }
  try { if (localStorage.getItem('moments-theme') === 'light') setTheme('light'); } catch {}
  gallery.querySelectorAll('.mg-theme').forEach(button => button.addEventListener('click', () => {
    setTheme(gallery.dataset.theme === 'dark' ? 'light' : 'dark');
  }));

  function readTile(element) {
    const entry = byId.get(element.dataset.photo);
    return { element, link: element.querySelector('a'), photo: entry.photo, index: entry.index,
      x: 0, y: 0, w: 0, h: 0, dx: 0, dy: 0, scale: 1, tx: 0, ty: 0, ts: 1, visible: true };
  }

  function populate(isSpatial) {
    // Clones fill the reference-style wall, but are decorative and never duplicate keyboard stops.
    wall.querySelectorAll('[data-copy]').forEach(el => el.remove());
    originals.forEach(el => { el.style.cssText = ''; el.classList.remove('is-active', 'is-selected'); });
    if (isSpatial && originals.length < 144) {
      const count = Math.min(144 - originals.length, config.maxTiles - originals.length);
      for (let n = 0; n < count; n++) {
        const source = originals[(n * 13 + 7) % originals.length];
        const clone = source.cloneNode(true);
        clone.dataset.copy = 'true';
        clone.setAttribute('aria-hidden', 'true');
        clone.querySelector('a').tabIndex = -1;
        clone.querySelector('img').loading = 'lazy';
        clone.querySelector('img').removeAttribute('fetchpriority');
        wall.append(clone);
      }
    }
    tiles = [...wall.children].map(readTile);
    tiles.forEach(tile => {
      tile.link.setAttribute('role', 'button');
      tile.link.setAttribute('aria-haspopup', 'dialog');
    });
    active = null;
  }

  function layout() {
    cancelFlight();
    const nextSpatial = !narrow.matches && !gridMode;
    if (nextSpatial !== spatial || !tiles.length) {
      spatial = nextSpatial;
      populate(spatial);
    }
    gallery.classList.toggle('is-spatial', spatial);
    gallery.classList.toggle('is-grid', !spatial);
    stageRect = viewport.getBoundingClientRect();
    if (spatial) {
      const gap = parseFloat(getComputedStyle(gallery).getPropertyValue('--mg-gap')) || 7;
      const height = Number(getComputedStyle(gallery).getPropertyValue('--mg-row-height')) || 76;
      const width = viewport.clientWidth;
      let row = [], ratioSum = 0, y = -height * .35;
      const placeRow = (last = false) => {
        let rowHeight = (width - gap * (row.length - 1)) / ratioSum;
        if (last) rowHeight = Math.min(rowHeight, height);
        let x = 0;
        for (const tile of row) {
          tile.w = rowHeight * tile.photo.width / tile.photo.height;
          tile.h = rowHeight; tile.x = x; tile.y = y;
          tile.element.style.width = `${tile.w}px`;
          tile.element.style.height = `${tile.h}px`;
          tile.element.querySelector('img').sizes = `${Math.ceil(tile.w)}px`;
          tile.element.querySelectorAll('source').forEach(source => { source.sizes = `${Math.ceil(tile.w)}px`; });
          x += tile.w + gap;
        }
        y += rowHeight + gap; row = []; ratioSum = 0;
      };
      for (const tile of tiles) {
        row.push(tile); ratioSum += tile.photo.width / tile.photo.height;
        if (ratioSum * height + gap * (row.length - 1) >= width) placeRow();
      }
      if (row.length) placeRow(true);
      wall.style.height = `${Math.max(y, viewport.clientHeight)}px`;
    } else {
      wall.style.height = '';
      for (const tile of tiles) {
        tile.element.style.cssText = '';
        tile.element.querySelectorAll('source,img').forEach(img => { img.sizes = '(max-width: 680px) 44vw, 220px'; });
      }
    }
    if (dialog.open) {
      selectedTile = tiles.find(tile => tile.index === current);
      selectedTile?.element.classList.add('is-selected');
      measureHole();
    }
    updateVisibility();
    setTargets();
    if (spatial) render(performance.now(), true);
  }

  function updateVisibility() {
    const top = viewport.scrollTop, bottom = top + viewport.clientHeight;
    for (const tile of tiles) tile.visible = tile.y + tile.h > top - 260 && tile.y < bottom + 260;
  }

  function activate(tile) {
    if (active === tile) return;
    active?.element.classList.remove('is-active');
    active = tile;
    if (active) {
      active.element.classList.add('is-active');
      const sizes = `${Math.ceil(active.w * config.hoverScale)}px`;
      active.element.querySelectorAll('source,img').forEach(image => { image.sizes = sizes; });
    }
    setTargets();
  }

  function resolvePointer() {
    stageRect = viewport.getBoundingClientRect();
    if (!pointer || dialog.open || !spatial || !fine.matches) return;
    const x = pointer.x - stageRect.left;
    const y = pointer.y - stageRect.top + viewport.scrollTop;
    // Hit-test stable layout coordinates; displaced elements would create hover oscillation.
    const hit = tiles.find(tile => x >= tile.x && x <= tile.x + tile.w && y >= tile.y && y <= tile.y + tile.h);
    activate(hit || null);
  }

  function setTargets() {
    for (const tile of tiles) {
      tile.tx = 0; tile.ty = 0; tile.ts = 1;
      if (!spatial || reduced.matches) continue;
      if (dialog.open && openHole) {
        const cx = tile.x + tile.w / 2, cy = tile.y + tile.h / 2;
        const dx = cx - openHole.x, dy = cy - openHole.y;
        const rx = openHole.w / 2 + tile.w / 2 + 12, ry = openHole.h / 2 + tile.h / 2 + 12;
        if (Math.abs(dx) < rx && Math.abs(dy) < ry) {
          if (Math.abs(dx / rx) > Math.abs(dy / ry)) tile.tx = Math.sign(dx || 1) * (rx - Math.abs(dx));
          else tile.ty = Math.sign(dy || 1) * (ry - Math.abs(dy));
        }
      } else if (active) {
        if (tile === active) {
          tile.ts = Math.min(config.hoverScale, (stageRect.width - 24) / tile.w, (stageRect.height - 32) / tile.h);
          const halfW = tile.w * tile.ts / 2, halfH = tile.h * tile.ts / 2;
          const cx = tile.x + tile.w / 2, cy = tile.y + tile.h / 2 - viewport.scrollTop;
          tile.tx = clamp(cx, halfW + 8, stageRect.width - halfW - 8) - cx;
          tile.ty = clamp(cy, halfH + 8, stageRect.height - halfH - 8) - cy;
        } else {
          const dx = tile.x + tile.w / 2 - (active.x + active.w / 2);
          const dy = tile.y + tile.h / 2 - (active.y + active.h / 2);
          const rx = active.w * config.hoverScale / 2 + tile.w / 2 + 22;
          const ry = active.h * config.hoverScale / 2 + tile.h / 2 + 22;
          const distance = Math.hypot(dx / rx, dy / ry);
          if (distance < 1.7) {
            const force = Math.pow(1 - distance / 1.7, 2) * config.repel * 2;
            const angle = Math.atan2(dy, dx);
            tile.tx = Math.cos(angle) * force; tile.ty = Math.sin(angle) * force;
          }
        }
      }
    }
    wake();
  }

  function wake() {
    if (!frame && spatial && !document.hidden) frame = requestAnimationFrame(time => render(time));
  }
  function render(time, immediate = false) {
    if (immediate && frame) cancelAnimationFrame(frame);
    frame = 0;
    if (!spatial) return;
    if (dirtyPointer) { dirtyPointer = false; resolvePointer(); }
    if (frame) { cancelAnimationFrame(frame); frame = 0; }
    const dt = clamp((time - previousTime) / 1000 || 1 / 60, .001, .05);
    previousTime = time;
    const amount = immediate || reduced.matches ? 1 : 1 - Math.exp(-config.response * dt);
    let moving = false;
    for (const tile of tiles) {
      if (!tile.visible && tile !== active) continue;
      tile.dx += (tile.tx - tile.dx) * amount;
      tile.dy += (tile.ty - tile.dy) * amount;
      tile.scale += (tile.ts - tile.scale) * amount;
      const unsettled = Math.abs(tile.tx - tile.dx) > .08 || Math.abs(tile.ty - tile.dy) > .08 || Math.abs(tile.ts - tile.scale) > .002;
      if (!unsettled) { tile.dx = tile.tx; tile.dy = tile.ty; tile.scale = tile.ts; }
      moving ||= unsettled;
      tile.element.style.transform = `translate3d(${(tile.x + tile.dx).toFixed(2)}px,${(tile.y + tile.dy).toFixed(2)}px,0) scale(${tile.scale.toFixed(4)})`;
      tile.element.style.zIndex = tile === active ? '3' : '1';
      tile.element.style.willChange = unsettled ? 'transform' : '';
    }
    if (moving || dirtyPointer) wake();
  }

  viewport.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || !fine.matches || dialog.open || !spatial) return;
    pointer = { x: event.clientX, y: event.clientY }; dirtyPointer = true; wake();
  }, { passive: true });
  viewport.addEventListener('pointerleave', () => { pointer = null; dirtyPointer = false; if (!dialog.open) activate(null); });
  viewport.addEventListener('scroll', () => {
    updateVisibility(); pointer = null; dirtyPointer = false; activate(null); wake();
  }, { passive: true });
  wall.addEventListener('focusin', event => {
    if (!event.target.matches(':focus-visible') || dialog.open) return;
    const tile = tiles.find(t => t.element.contains(event.target));
    if (!tile || !spatial) return;
    const top = tile.y - 80, bottom = tile.y + tile.h + 140;
    if (top < viewport.scrollTop) viewport.scrollTop = Math.max(0, top);
    else if (bottom > viewport.scrollTop + viewport.clientHeight) viewport.scrollTop = bottom - viewport.clientHeight;
    activate(tile);
  });
  wall.addEventListener('focusout', event => { if (!wall.contains(event.relatedTarget) && !dialog.open) activate(null); });
  wall.addEventListener('click', event => {
    const link = event.target.closest('.mg-photo');
    if (!link || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const tile = spatial && pointer && active ? active : tiles.find(t => t.link === link);
    if (tile) openPhoto(tile.index, tile, true);
  });
  wall.addEventListener('keydown', event => {
    const tile = tiles.find(t => t.link === event.target);
    if (!tile) return;
    if (event.key === ' ') { event.preventDefault(); openPhoto(tile.index, tile, true); }
    if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      let index = event.key === 'Home' ? 0 : event.key === 'End' ? originals.length - 1 : (tile.index + (event.key === 'ArrowRight' ? 1 : -1) + originals.length) % originals.length;
      originals[index].querySelector('a').focus();
    }
  });
  layoutButton.addEventListener('click', () => {
    gridMode = !gridMode;
    layoutButton.setAttribute('aria-pressed', String(gridMode));
    layoutButton.innerHTML = `${text(gridMode ? 'wall' : 'grid')} <span aria-hidden="true">↗</span>`;
    viewport.scrollTop = 0; pointer = null; layout();
  });

  function lockScroll() {
    lock = { y: window.scrollY, x: window.scrollX, position: document.body.style.position,
      top: document.body.style.top, left: document.body.style.left, width: document.body.style.width,
      paddingRight: document.body.style.paddingRight, overflow: document.body.style.overflow };
    const gutter = innerWidth - document.documentElement.clientWidth;
    const padding = parseFloat(getComputedStyle(document.body).paddingRight);
    document.body.style.position = 'fixed'; document.body.style.top = `-${lock.y}px`;
    document.body.style.left = `-${lock.x}px`; document.body.style.width = '100%';
    document.body.style.paddingRight = `${padding + gutter}px`; document.body.style.overflow = 'hidden';
  }
  function unlockScroll() {
    if (!lock) return;
    const { x, y, ...style } = lock; Object.assign(document.body.style, style);
    window.scrollTo({ left: x, top: y, behavior: 'instant' }); lock = null;
  }
  function cancelFlight() {
    flightAnimation?.cancel(); flightAnimation = null; flight?.remove(); flight = null;
    feature.style.visibility = '';
  }
  async function fly(from, to, src) {
    cancelFlight();
    if (!motionDuration() || !from?.width || !to?.width || typeof feature.animate !== 'function') return;
    const layer = document.createElement('img');
    layer.src = src; layer.alt = ''; layer.setAttribute('aria-hidden', 'true');
    Object.assign(layer.style, { position: 'fixed', left: `${to.left}px`, top: `${to.top}px`,
      width: `${to.width}px`, height: `${to.height}px`, objectFit: 'contain', pointerEvents: 'none',
      transformOrigin: '0 0', zIndex: '100', borderRadius: '2px' });
    dialog.append(layer); flight = layer; feature.style.visibility = 'hidden';
    const animation = layer.animate([
      { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width},${from.height / to.height})` },
      { transform: 'translate(0,0) scale(1,1)' }
    ], { duration: motionDuration(), easing: config.ease, fill: 'both' });
    flightAnimation = animation;
    try { await animation.finished; } catch {}
    if (flight === layer) cancelFlight();
  }
  function setPicture(photo) {
    feature.querySelectorAll('source').forEach(source => source.remove());
    for (const format of ['avif', 'webp']) {
      if (!photo.variants[format]) continue;
      const source = document.createElement('source'); source.type = `image/${format}`;
      source.srcset = srcset(photo, format); source.sizes = '(max-width: 680px) 90vw, 322px';
      feature.insertBefore(source, featureImg);
    }
    featureImg.alt = photo.alt; featureImg.width = photo.width; featureImg.height = photo.height;
    // Fixed intended geometry reserves space even while the full image is downloading.
    featureImg.style.aspectRatio = `${photo.width} / ${photo.height}`;
    featureImg.sizes = '(max-width: 680px) 90vw, 322px';
    featureImg.srcset = srcset(photo, 'jpg'); featureImg.src = photo.src;
    featureImg.style.visibility = ''; error.hidden = true;
  }
  function measureHole() {
    const box = dialog.getBoundingClientRect(); stageRect = viewport.getBoundingClientRect();
    openHole = { x: box.left - stageRect.left + box.width / 2,
      y: box.top - stageRect.top + viewport.scrollTop + box.height / 2, w: box.width + 12, h: box.height + 6 };
  }
  function photoHash(index) { return `#${data[index].id}`; }
  function indexFromHash() { return data.findIndex(photo => `#${photo.id}` === location.hash); }
  function writeHistory(index, first) {
    if (first) {
      baseHash = location.hash; ownsEntry = true;
      history.pushState({ ...history.state, moments: true }, '', photoHash(index));
    } else history.replaceState(history.state, '', photoHash(index));
  }
  async function openPhoto(index, tile = null, user = false) {
    if (historyPending || closing) return;
    const token = ++serial, wasOpen = dialog.open;
    cancelFlight();
    stageRect = viewport.getBoundingClientRect();
    const origin = tile?.element.getBoundingClientRect();
    const preview = tile?.element.querySelector('img').currentSrc;
    selectedTile?.element.classList.remove('is-selected');
    selectedTile = tile || tiles.find(t => t.index === index);
    current = (index + data.length) % data.length;
    const photo = data[current];
    if (!wasOpen) {
      returnFocus = tile?.link || document.activeElement;
      lockScroll(); dialog.showModal(); gallery.classList.add('is-open');
      dialog.querySelector('[data-action=close]').focus({ preventScroll: true });
    }
    if (user) writeHistory(current, !wasOpen);
    dialog.querySelector('#mg-title').textContent = photo.title;
    dialog.querySelector('.mg-category').textContent = text('category');
    dialog.querySelector('.mg-counter').textContent = `${String(current + 1).padStart(2, '0')} / ${String(data.length).padStart(2, '0')}`;
    dialog.querySelector('.mg-meta').textContent = [photo.location, photo.year].filter(Boolean).join(' · ');
    dialog.querySelector('#mg-description').textContent = photo.description || '';
    dialog.querySelector('.mg-original').href = photo.src;
    dialog.querySelectorAll('[data-action=prev],[data-action=next]').forEach(b => { b.disabled = data.length < 2; });
    status.textContent = '';
    const ready = () => {
      if (serial !== token || !dialog.open) return;
      imageStage.classList.remove('is-loading'); error.hidden = true; featureImg.style.visibility = '';
      measureHole(); setTargets(); prefetchNeighbours();
    };
    const failed = () => {
      if (serial !== token || !dialog.open) return;
      imageStage.classList.remove('is-loading'); featureImg.style.visibility = 'hidden'; error.hidden = false;
      cancelFlight(); measureHole(); setTargets();
    };
    // Load/error events are authoritative: decode() can reject when a rapid navigation
    // cancels a previous source even though the next source will load successfully.
    featureImg.onload = ready;
    featureImg.onerror = failed;
    imageStage.classList.add('is-loading');
    setPicture(photo);
    selectedTile?.element.classList.add('is-selected');
    measureHole(); setTargets();
    if (!wasOpen && origin && preview) fly(origin, featureImg.getBoundingClientRect(), preview);
    else if (motionDuration() && typeof feature.animate === 'function') feature.animate([{ opacity: .2 }, { opacity: 1 }], { duration: 180 });
    requestAnimationFrame(() => {
      if (serial !== token) return;
      if (featureImg.complete) featureImg.naturalWidth ? ready() : failed();
    });
  }
  const preloads = [];
  function prefetchNeighbours() {
    if (navigator.connection?.saveData || /(^|-)2g/.test(navigator.connection?.effectiveType || '')) return;
    preloads.length = 0;
    for (const offset of [-1, 1]) {
      const photo = data[(current + offset + data.length) % data.length];
      const img = new Image(); const format = photo.variants.webp ? 'webp' : 'jpg';
      img.sizes = '(max-width: 680px) 90vw, 322px'; img.srcset = srcset(photo, format);
      img.src = photo.variants[format].at(-1).src; preloads.push(img);
    }
  }
  async function finishClose() {
    if (!dialog.open || closing) return;
    closing = true; ++serial;
    cancelFlight();
    const from = featureImg.getBoundingClientRect();
    const target = selectedTile;
    openHole = null; gallery.classList.remove('is-open'); active?.element.classList.remove('is-active'); active = null; setTargets();
    // The wall returns under the shared image; close lands at the thumbnail's resting position.
    const destination = target && spatial ? {
      left: stageRect.left + target.x, top: stageRect.top + target.y - viewport.scrollTop,
      width: target.w, height: target.h
    } : target?.element.getBoundingClientRect();
    if (destination && destination.top + destination.height > stageRect.top && destination.top < stageRect.bottom) {
      await fly(from, destination, featureImg.currentSrc);
    }
    dialog.close(); target?.element.classList.remove('is-selected'); selectedTile = null;
    current = -1; closing = false; ownsEntry = false; historyPending = false;
    unlockScroll(); pointer = null; dirtyPointer = false; activate(null); setTargets();
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
    else layoutButton.focus({ preventScroll: true });
  }
  function requestClose() {
    if (!dialog.open || closing || historyPending) return;
    if (ownsEntry) { historyPending = true; history.back(); }
    else {
      if (indexFromHash() >= 0) history.replaceState(history.state, '', location.pathname + location.search + (baseHash.startsWith('#photo-') ? '' : baseHash));
      finishClose();
    }
  }
  function syncHistory() {
    historyPending = false;
    const index = indexFromHash();
    if (index < 0) finishClose();
    else if (index !== current || !dialog.open) openPhoto(index);
  }
  addEventListener('popstate', syncHistory);
  addEventListener('hashchange', syncHistory);
  dialog.addEventListener('cancel', event => { event.preventDefault(); requestClose(); });
  // Some touch browsers suppress the compatibility click following a swipe.
  // Activate a stationary button tap on pointerup, then consume only its duplicate click.
  let buttonTouch = null, touchActivation = null;
  dialog.addEventListener('pointerdown', event => {
    touchActivation = null;
    const button = event.target.closest('button:not(:disabled)');
    buttonTouch = event.pointerType === 'touch' && event.isPrimary && button
      ? { button, id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() }
      : null;
  });
  dialog.addEventListener('pointercancel', () => { buttonTouch = null; });
  dialog.addEventListener('pointerup', event => {
    const tap = buttonTouch;
    buttonTouch = null;
    if (!tap || event.pointerId !== tap.id || event.target.closest('button') !== tap.button) return;
    if (Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 10 || performance.now() - tap.time > 1000) return;
    event.preventDefault();
    touchActivation = { button: tap.button, time: performance.now() };
    tap.button.click();
  });
  dialog.addEventListener('click', event => {
    if (event.isTrusted && touchActivation && event.detail !== 0
        && event.target.closest('button') === touchActivation.button
        && performance.now() - touchActivation.time < 800) {
      event.preventDefault();
      event.stopImmediatePropagation();
      touchActivation = null;
    }
  }, true);
  dialog.addEventListener('click', event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (action === 'close') requestClose();
    if (action === 'prev' || action === 'next') {
      if (data.length > 1) openPhoto((current + (action === 'next' ? 1 : -1) + data.length) % data.length, null, true);
    }
    if (action === 'retry') openPhoto(current);
    if (action === 'share') copyLink();
    if (event.target === dialog) {
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) requestClose();
    }
  });
  dialog.addEventListener('keydown', event => {
    if (event.target.matches('input,textarea,select')) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault(); if (data.length > 1) openPhoto((current + (event.key === 'ArrowRight' ? 1 : -1) + data.length) % data.length, null, true);
    }
    if (event.key === 'Tab') {
      const focusable = [...dialog.querySelectorAll('button:not(:disabled),a[href],input')].filter(el => el.getClientRects().length);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
  imageStage.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' || !event.isPrimary) return;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now() };
    imageStage.setPointerCapture(event.pointerId);
  });
  imageStage.addEventListener('pointercancel', () => { swipe = null; });
  imageStage.addEventListener('pointerup', event => {
    if (!swipe || swipe.id !== event.pointerId) return;
    const dx = event.clientX - swipe.x, dy = event.clientY - swipe.y, elapsed = performance.now() - swipe.time;
    swipe = null;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.4 && elapsed < 900 && data.length > 1) {
      openPhoto((current + (dx < 0 ? 1 : -1) + data.length) % data.length, null, true);
    }
  });
  async function copyLink() {
    const url = location.href;
    if (location.protocol === 'file:') { status.textContent = text('publish'); return; }
    try { await navigator.clipboard.writeText(url); status.textContent = text('copied'); }
    catch {
      status.textContent = text('copy');
      const input = document.createElement('input'); input.className = 'mg-share-input'; input.value = url; input.readOnly = true;
      input.setAttribute('aria-label', text('copyLabel')); status.append(input); input.focus(); input.select();
    }
  }

  const scheduleLayout = () => {
    if (!resizeFrame) resizeFrame = requestAnimationFrame(() => { resizeFrame = 0; layout(); });
  };
  if ('ResizeObserver' in window) new ResizeObserver(scheduleLayout).observe(viewport);
  else addEventListener('resize', scheduleLayout);
  addEventListener('resize', scheduleLayout);
  narrow.addEventListener('change', scheduleLayout);
  reduced.addEventListener('change', () => {
    pointer = null; cancelFlight(); activate(null); setTargets();
    if (spatial) render(performance.now(), true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(frame); frame = 0; }
    else { previousTime = performance.now(); wake(); }
  });

  function syncLanguage() {
    language = document.documentElement.lang.startsWith('sv') ? 'sv' : 'en';
    data.forEach((photo, i) => {
      photo.title = language === 'sv' ? photo.titleSv : englishPhotos[i].title;
      photo.alt = language === 'sv' ? photo.altSv : englishPhotos[i].alt;
    });
    gallery.querySelector('.mg-brand').innerHTML = `<span aria-hidden="true">◉</span> ${text('brand')}`;
    gallery.querySelector('.mg-brand').setAttribute('aria-label', text('brandLabel'));
    gallery.querySelector('.mg-skip').textContent = text('skip');
    gallery.querySelector('.mg-edition').textContent = text('edition');
    viewport.setAttribute('aria-label', text('viewport'));
    wall.setAttribute('aria-label', text('photos'));
    gallery.querySelector('.mg-intro .mg-eyebrow').innerHTML = `<span></span> ${text('eyebrow')}`;
    gallery.querySelector('#gallery-title').innerHTML = `${text('brand')}<span>.</span>`;
    gallery.querySelector('.mg-hint').textContent = text('hint');
    gallery.querySelector('.mg-total').textContent = `${String(data.length).padStart(2, '0')} ${text('photos').toUpperCase()}`;
    layoutButton.innerHTML = `${text(gridMode ? 'wall' : 'grid')} <span aria-hidden="true">↗</span>`;
    gallery.querySelectorAll('.mg-theme').forEach(b => {
      b.setAttribute('aria-label', text(gallery.dataset.theme === 'dark' ? 'light' : 'dark'));
      b.title = text('theme');
    });
    for (const key of ['prev', 'next', 'close']) dialog.querySelector(`[data-action=${key}]`).setAttribute('aria-label', text(key));
    error.firstChild.textContent = text('error') + ' ';
    dialog.querySelector('[data-action=retry]').textContent = text('retry');
    dialog.querySelector('[data-action=share]').innerHTML = `${text('share')} <span aria-hidden="true">↗</span>`;
    dialog.querySelector('.mg-original').textContent = text('original') + ' ↗';
    wall.querySelectorAll('.mg-tile').forEach(tile => {
      const photo = byId.get(tile.dataset.photo).photo;
      tile.querySelector('a').setAttribute('aria-label', `${text('open')} ${photo.title}`);
      tile.querySelector('img').alt = photo.alt;
      tile.querySelector('.mg-hover-caption').textContent = photo.title;
      tile.querySelector('figcaption').textContent = photo.title;
      tile.querySelector('.mg-image-error').textContent = text('missing');
    });
    if (dialog.open && current >= 0) {
      dialog.querySelector('#mg-title').textContent = data[current].title;
      dialog.querySelector('.mg-category').textContent = text('category');
      featureImg.alt = data[current].alt;
    }
  }
  document.addEventListener('languagechange', syncLanguage);
  syncLanguage();
  layout();
  // Initial deep link is a replaceable entry: closing it must not send the visitor away.
  const initial = indexFromHash();
  if (initial >= 0) { baseHash = ''; openPhoto(initial); }
})();

(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-transparency: reduce)');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const contrast = matchMedia('(prefers-contrast: more), (forced-colors: active)');
  let solid = false;
  try { solid = localStorage.getItem('daugavan-solid-surfaces') === 'true'; } catch (_) {}
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'glass-preference';
  document.querySelector('.foot')?.appendChild(button);
  const update = () => {
    root.classList.toggle('solid-surfaces', solid || reduced.matches || contrast.matches);
    const sv = root.lang.startsWith('sv');
    button.textContent = sv ? 'Minska glaseffekter' : 'Reduce glass effects';
    button.setAttribute('aria-pressed', String(solid || reduced.matches || contrast.matches));
    button.disabled = reduced.matches || contrast.matches;
    document.dispatchEvent(new Event('glasschange'));
  };
  button.addEventListener('click', () => {
    solid = !solid;
    try { localStorage.setItem('daugavan-solid-surfaces', String(solid)); } catch (_) {}
    update();
  });
  reduced.addEventListener('change', update);
  contrast.addEventListener('change', update);
  document.addEventListener('languagechange', update);
  update();

  const header = document.querySelector('.identity');
  const control = document.getElementById('langSwitch');
  if (!header || !control || !window.ResizeObserver) return;
  const backdrop = document.createElement('span');
  backdrop.className = 'glass-backdrop';
  backdrop.setAttribute('aria-hidden', 'true');
  control.prepend(backdrop);
  const source = new Image();
  let frame = 0;
  let offsetX = 0;
  let offsetY = 0;
  const paint = () => {
    frame = 0;
    if (!source.naturalWidth) return;
    const h = header.getBoundingClientRect();
    const c = control.getBoundingClientRect();
    const scale = Math.max(h.width / source.naturalWidth, h.height / source.naturalHeight);
    const width = source.naturalWidth * scale;
    const height = source.naturalHeight * scale;
    // Match the existing cover positioning before magnifying around the control's center.
    const topAligned = matchMedia('(max-width: 640px)').matches;
    const left = (h.width - width) / 2;
    const top = topAligned ? 0 : h.height - height;
    const zoom = 1.14;
    backdrop.style.backgroundSize = `${width * zoom}px ${height * zoom}px`;
    backdrop.style.backgroundPosition = `${(left - (c.left - h.left) - c.width / 2) * zoom + c.width / 2 + offsetX}px ${(top - (c.top - h.top) - c.height / 2) * zoom + c.height / 2 + offsetY}px`;
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
  control.addEventListener('pointermove', event => {
    if (motion.matches || root.classList.contains('solid-surfaces') || event.pointerType !== 'mouse') return;
    const box = control.getBoundingClientRect();
    offsetX = (event.clientX - box.left - box.width / 2) * .06;
    offsetY = (event.clientY - box.top - box.height / 2) * .06;
    schedule();
  });
  control.addEventListener('pointerleave', () => { offsetX = offsetY = 0; schedule(); });
  new ResizeObserver(schedule).observe(header);
  document.addEventListener('languagechange', schedule);
  source.onload = schedule;
  source.src = 'images/identity-cover.webp';
})();

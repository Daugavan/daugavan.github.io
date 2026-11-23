document.documentElement.classList.add('js');
document.documentElement.classList.toggle('glass-solid', window.matchMedia(
  '(prefers-reduced-transparency: reduce), (prefers-contrast: more), (forced-colors: active)'
).matches);

// Apply the saved material preference before the first paint.
try {
  if (localStorage.getItem('coco-glass') === 'off') {
    document.documentElement.dataset.glass = 'off';
  }
} catch (error) { /* The in-session preference still works without storage. */ }

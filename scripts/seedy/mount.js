function hairline(figure) {
  const stage = document.getElementById('seedy-stage');
  if (!stage) return;
  const svg = HL.mk('svg', { viewBox: '0 0 400 320', 'aria-hidden': 'true' }, stage);
  const read = { textContent: 'rest' };
  const handle = figure.mount({ stage, svg, read }, figure.range[1]);
  const button = document.getElementById('seedy-pause');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = motion.matches;
  const update = () => {
    const stopped = paused || motion.matches;
    HL.setReducedMotion(stopped);
    handle.set(stopped ? 0 : figure.range[1]);
    button.setAttribute('aria-pressed', String(stopped));
    button.setAttribute('aria-label', stopped ? 'Play Seedy animation' : 'Pause Seedy animation');
    button.querySelector('span').textContent = stopped ? '▶' : 'Ⅱ';
  };
  button.addEventListener('click', () => { paused = !paused; update(); });
  motion.addEventListener('change', () => { paused = motion.matches; update(); });
  update();
}

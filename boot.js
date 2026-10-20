(() => {
  'use strict';

  const screen = document.getElementById('portfolioBoot');
  const skip = document.getElementById('bootSkip');
  const log = document.getElementById('bootLog');
  const prompt = document.getElementById('bootPrompt');
  const command = document.getElementById('bootCommand');
  const status = document.getElementById('bootStatus');
  if (!screen || !skip || !log || !prompt || !command || !status) return;

  const root = document.documentElement;
  const sessionKey = 'daugavan_portfolio_boot_v1';
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const navigation = performance.getEntriesByType('navigation')[0];
  let seen = false;
  try { seen = sessionStorage.getItem(sessionKey) === 'seen'; } catch (_) {}
  if (seen || motion.matches || location.hash || navigation?.type === 'back_forward') return;

  const timers = new Set();
  let finished = false;
  let background = null;
  let previousInert = false;
  let previousHidden = null;

  function schedule(callback, delay) {
    const timer = setTimeout(() => {
      timers.delete(timer);
      if (finished) return;
      try { callback(); } catch (_) { finish(); }
    }, delay);
    timers.add(timer);
  }

  function translate() {
    let language;
    try { language = localStorage.getItem('lang'); } catch (_) {}
    const swedish = language === 'sv' || (language !== 'en' &&
      navigator.languages?.some(value => value.toLowerCase().startsWith('sv')));
    screen.lang = swedish ? 'sv' : 'en';
    skip.replaceChildren(document.createTextNode(swedish ? 'Hoppa över ' : 'Skip intro '));
    const hint = document.createElement('span');
    hint.setAttribute('aria-hidden', 'true');
    hint.textContent = '[Esc]';
    skip.append(hint);
    status.textContent = swedish ? 'Portfolion startar…' : 'Starting portfolio…';
  }

  function lockBackground() {
    if (finished || background) return;
    background = document.querySelector('.wrap');
    if (!background) return;
    previousInert = background.inert;
    previousHidden = background.getAttribute('aria-hidden');
    background.inert = true;
    background.setAttribute('aria-hidden', 'true');
  }

  function finish() {
    if (finished) return;
    finished = true;
    const restoreFocus = screen.contains(document.activeElement);
    timers.forEach(clearTimeout);
    timers.clear();
    screen.hidden = true;
    root.classList.remove('boot-active', 'boot-exiting');
    if (background) {
      background.inert = previousInert;
      if (previousHidden === null) background.removeAttribute('aria-hidden');
      else background.setAttribute('aria-hidden', previousHidden);
    }
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('DOMContentLoaded', lockBackground);
    document.removeEventListener('languagechange', translate);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', finish);
    window.removeEventListener('pageshow', onPageShow);
    window.removeEventListener('hashchange', finish);
    motion.removeEventListener('change', onMotion);
    skip.removeEventListener('click', finish);
    if (restoreFocus) document.getElementById('mainContent')?.focus({ preventScroll: true });
  }

  function onKey(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      finish();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      skip.focus({ preventScroll: true });
    }
  }
  function onVisibility() { if (document.hidden) finish(); }
  function onMotion() { if (motion.matches) finish(); }
  function onPageShow(event) { if (event.persisted) finish(); }

  // Arm recovery before showing or locking anything; it does not depend on animation events.
  schedule(finish, 4000);
  try {
    translate();
    try { sessionStorage.setItem(sessionKey, 'seen'); } catch (_) {}
    document.addEventListener('DOMContentLoaded', lockBackground, { once: true });
    document.addEventListener('languagechange', translate);
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', finish);
    window.addEventListener('pageshow', onPageShow);
    window.addEventListener('hashchange', finish);
    motion.addEventListener('change', onMotion);
    skip.addEventListener('click', finish);
    root.classList.add('boot-active');
    screen.hidden = false;
    skip.focus({ preventScroll: true });
    if (document.readyState !== 'loading') lockBackground();

    const lines = [
      [260, '0.084', 'Initializing portfolio interface'],
      [440, '0.216', 'Loading interface configuration'],
      [610, '0.392', 'Mounting public project index'],
      [820, '0.571', 'Preparing gallery'],
      [1030, '0.804', 'Registering language controls'],
      [1150, '0.912', 'Preparing profile layout'],
      [1210, '0.946', 'Mounting project links'],
      [1270, '0.981', 'Preparing activity panels'],
      [1370, '1.026', 'Starting background services'],
      [1430, '1.068', 'Queueing public statistics refresh'],
      [1490, '1.104', 'Preparing keyboard navigation'],
      [1630, '1.179', 'Initializing Seedy companion'],
      [1690, '1.218', 'Applying interface theme'],
      [1770, '1.264', 'Preparing portfolio session'],
      [1930, '1.382', 'Portfolio interface ready']
    ];
    for (const [delay, timestamp, message] of lines) {
      schedule(() => {
        const row = document.createElement('div');
        row.className = 'boot-line';
        const time = document.createElement('span');
        time.className = 'boot-time';
        time.textContent = `[ ${timestamp} ]`;
        const text = document.createElement('span');
        text.textContent = message;
        row.append(time, text);
        log.append(row);
      }, delay);
    }
    schedule(() => { prompt.hidden = false; }, 2200);
    Array.from('start portfolio').forEach((character, index) => {
      schedule(() => { command.textContent += character; }, 2230 + index * 28);
    });
    schedule(() => { root.classList.add('boot-exiting'); }, 2700);
    schedule(finish, 3000);
  } catch (_) { finish(); }
})();

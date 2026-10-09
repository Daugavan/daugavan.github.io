(() => {
  'use strict';
  const KEY = 'daugavan_activity_v1';
  const ENDPOINT = 'https://api.github.com/repos/Daugavan/daugavan.github.io/contents/activity-snapshot.json?ref=main';
  const palettes = {
    github: ['#161e2b', '#0e4429', '#006d32', '#26a641', '#39d353'],
    lovable: ['#202630', '#153561', '#124b88', '#0867bd', '#087ced']
  };
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  let snapshot;
  function valid(data) {
    if (data?.version !== 1) return false;
    return ['github', 'lovable'].every(name => {
      const entry = data[name];
      if (!entry || !Number.isSafeInteger(entry.total) || entry.total < 0 || entry.total > 1e9 ||
          !/^\d{4}-\d{2}-\d{2}$/.test(entry.retrieved)) return false;
      const date = Date.parse(entry.retrieved + 'T00:00:00Z');
      return Number.isFinite(date) && date <= Date.now() + 86400000 &&
        Array.isArray(entry.columns) && entry.columns.length >= 50 && entry.columns.length <= 54 &&
        entry.columns.every(col => Array.isArray(col) && col.length === 7 && col.every(n => n === null || Number.isInteger(n) && n >= 0 && n <= 4)) &&
        Array.isArray(entry.months) && entry.months.length > 0 && entry.months.length <= 13 &&
        entry.months.every(pair => Array.isArray(pair) && pair.length === 2 && months.includes(pair[0]) && Number.isInteger(pair[1]) && pair[1] >= 0 && pair[1] < entry.columns.length);
    });
  }
  function calendar(name, entry, description) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 1000 130');
    const add = (tag, attributes, text) => {
      const element = document.createElementNS(svg.namespaceURI, tag);
      Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
      if (text !== undefined) element.textContent = text;
      svg.appendChild(element);
    };
    add('title', {}, description);
    const step = 952 / entry.columns.length;
    const label = (x, y, text, size = 11) => add('text', { x, y, fill: '#9ca8b8', 'font-family': 'system-ui, sans-serif', 'font-size': size }, text);
    entry.months.forEach(([month, column]) => label(34 + column * step, 14, month));
    if (name === 'github') [['Mon',1],['Wed',3],['Fri',5]].forEach(([text,row]) => label(2,33 + row * 13,text));
    entry.columns.forEach((column, x) => column.forEach((level, y) => {
      if (level !== null) add('rect', { x: (34 + x * step).toFixed(2), y: 24 + y * 13, width: (step - 3).toFixed(2), height: 10, rx: 2, fill: palettes[name][level] });
    }));
    label(851, 125, 'Less', 10); label(965, 125, 'More', 10);
    palettes[name].forEach((fill, i) => add('rect', { x: 879 + i * 15, y: 116, width: 10, height: 10, rx: 2, fill }));
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  }
  function render() {
    if (!snapshot) return;
    const swedish = document.documentElement.lang.startsWith('sv');
    const locale = swedish ? 'sv-SE' : 'en-US';
    for (const name of ['github','lovable']) {
      const entry = snapshot[name];
      const total = new Intl.NumberFormat(locale).format(entry.total);
      const date = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(entry.retrieved + 'T00:00:00Z'));
      const text = name === 'github'
        ? swedish ? `${total} bidrag under det senaste året` : `${total} contributions in the last year`
        : swedish ? `${total} redigeringar under det visade året` : `${total} edits in the displayed year`;
      const description = `${name === 'github' ? 'GitHub' : 'Lovable'}: ${text}. ${swedish ? 'Hämtad' : 'Retrieved'} ${date}.`;
      const heading = document.querySelector(`[data-i18n="${name}ActivityTotal"]`);
      const image = document.querySelector(`[data-i18n-alt="${name}ActivityAlt"]`);
      if (!heading || !image) continue;
      heading.textContent = text;
      heading.title = description;
      image.alt = description;
      image.src = calendar(name, entry, description);
    }
  }
  document.addEventListener('languagechange', render);
  let cached;
  try {
    cached = JSON.parse(localStorage.getItem(KEY));
    if (valid(cached?.data)) { snapshot = cached.data; render(); }
  } catch (_) { /* Use the verified values in the HTML. */ }
  if (cached && valid(cached.data) && Number.isFinite(cached.saved) && cached.saved <= Date.now() && Date.now() - cached.saved < 30 * 60 * 1000) return;
  (async () => {
    try {
      const response = await fetch(ENDPOINT, { headers: { Accept: 'application/vnd.github.raw+json' }, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error('Activity snapshot unavailable');
      const text = await response.text();
      if (text.length > 100000) throw new Error('Oversized activity snapshot');
      const data = JSON.parse(text);
      if (!valid(data)) throw new Error('Invalid activity snapshot');
      // Never replace a newer verified snapshot with an older API/cache response.
      if (snapshot && ['github','lovable'].some(name => data[name].retrieved < snapshot[name].retrieved)) return;
      snapshot = data;
      render();
      try { localStorage.setItem(KEY, JSON.stringify({ data, saved: Date.now() })); } catch (_) {}
    } catch (_) { /* Keep the last verified statistics and their actual date. */ }
  })();
})();

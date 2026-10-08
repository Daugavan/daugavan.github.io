(() => {
  'use strict';


  const GITHUB_USER = 'Daugavan';
  const GITHUB_API = 'https://api.github.com';
  const MAX_REPOS = 6;

  const CACHE_KEY = 'daugavan_gh_v5';
  const CACHE_TTL = 30 * 60 * 1000;
  const COMMIT_STATS_TTL = 6 * 60 * 60 * 1000;
  const FETCH_TIMEOUT = 8000;
  const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
  const MAX_REPO_PAGES = 10;
  const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;
  const COOLDOWN_KEY = 'daugavan_gh_cooldown';
  let requestBlockedUntil = 0;
  const numberFrames = new WeakMap();
  const isCount = (n) => Number.isSafeInteger(n) && n >= 0;
  let sourceKey = 'fetchingData';
  let sourceError = false;

  function normalizeRepos(repos) {
    if (!Array.isArray(repos) || repos.length > MAX_REPO_PAGES * 100) throw new Error('Invalid repositories');
    return repos.map((repo) => {
      if (!repo || typeof repo.name !== 'string' || !/^[A-Za-z0-9_.-]{1,100}$/.test(repo.name) || repo.name === '.' || repo.name === '..') {
        throw new Error('Invalid repository name');
      }
      if (!isCount(repo.stargazers_count)) throw new Error('Invalid star count');
      const text = (value, max) => typeof value === 'string' ? value.slice(0, max) : '';
      return {
        name: repo.name,
        description: text(repo.description, 1000),
        language: text(repo.language, 80),
        topics: Array.isArray(repo.topics) ? repo.topics.filter(v => typeof v === 'string').slice(0, 4).map(v => v.slice(0, 80)) : [],
        stargazers_count: repo.stargazers_count,
        updated_at: text(repo.updated_at, 40)
      };
    });
  }

  function cooldownUntil() {
    try {
      const value = Number(localStorage.getItem(COOLDOWN_KEY));
      return Math.max(requestBlockedUntil, Number.isFinite(value) ? Math.min(value, Date.now() + 60 * 60 * 1000) : 0);
    } catch (_) { return requestBlockedUntil; }
  }


  const REDUCED_MOTION =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  const elAvatar = document.getElementById('avatar');
  const elName = document.getElementById('name');
  const elLoginLine = document.getElementById('loginLine');
  const elBio = document.getElementById('bio');
  const elActions = document.getElementById('actions');
  const elReposWrap = document.getElementById('repos');
  const elStarsN = document.getElementById('starsN');
  const elReposN = document.getElementById('reposN');
  const elCommitsN = document.getElementById('commitsN');
  const elRepoCount = document.getElementById('repoCount');
  const elProgress = document.getElementById('progressFill');
  const elStatsSource = document.getElementById('statsSource');
  const elMainContent = document.getElementById('mainContent');
  const langSwitch = document.getElementById('langSwitch');
  const flagSv = document.getElementById('flag-sv');
  const flagUs = document.getElementById('flag-us');

  const esc = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

  const T = {
    en: {
      codexActivityTotal: '225 completed turns in the last year',
      codexActivityDate: '8 active days · October 8, 2026',
      codexCalendar: 'Codex activity calendar; scroll horizontally to see all months',
      codexActivityAlt: 'Codex activity calendar showing 225 completed turns across 8 active days in saved local history, through October 8, 2026.',

      activityTitle: 'Stats for nerds',
      activityJump: 'Explore my activity',
      currentActivity: 'Current activity',
      activitySnapshot: 'Saved activity snapshot. Follow the profile link for the latest activity.',
      githubCalendar: 'GitHub activity calendar; scroll horizontally to see all months',
      lovableCalendar: 'Lovable activity calendar; scroll horizontally to see all months',
      githubActivityTotal: '1,473 contributions in the last year',
      lovableActivityTotal: '430 edits in the displayed year',
      githubActivityAlt: 'GitHub activity calendar showing 1,473 contributions in the last year, retrieved on October 8, 2026.',
      lovableActivityAlt: 'Saved Lovable activity calendar showing 430 edits in the displayed year.',
      openLovable: "Open Lovable profile (opens in new tab)",
      openPF: "Open PromptFlower (opens in new tab)",
      pfSubtitle: "Private prompt studio",
      pfUrl: "promptflower.app / private prompt studio",
      noScriptStats: "Enable JavaScript for GitHub statistics.",
      retryLater: "GitHub request limit reached · please retry later",
      sourceCachedCommit: "Repository data loaded · cached commit count",
      skipContent: "Skip to content",
      staticBio: 'Creative technologist with a passion for cybersecurity, AI, coding, and photography.',
      switchLanguage: 'Switch to Swedish',
      currentLanguage: 'English',
      statsTitle: 'GitHub Stats',
      live: "public",
      stars: 'Stars',
      repos: 'Repos',
      commits: 'Commits',
      fetchingData: 'Fetching live data…',
      repositories: 'Repositories',
      reposTitle: 'Repositories',
      loading: 'Loading…',
      statsCached: "Cached GitHub data",
      statsPartial: "Partial GitHub data · counts may be incomplete",
      statsUnavailable: 'GitHub data loaded · commit count unavailable',
      statsLoaded: "GitHub data loaded",
      retry: 'Retry',
      statsOffline: 'GitHub is unreachable right now · showing cached data',
      galleryTitle: 'Gallery',
      previous: 'Previous',
      next: 'Next',
      noRepos: 'No public repositories found.',
      noDesc: 'No description.',
      ofShown: (n, total) => `${n} of ${total} shown`,
      lovableKicker: 'Featured · Profile',
      lovableTitle: 'Lovable profile',
      pfKicker: 'My apps',
      pfStudio: 'Private prompt studio',
      pfTitle: 'Turn a quick idea into a structured superprompt.',
      pfLede: 'A private prompt studio — with support for online/offline and API/local workflows.',
      pfBody: 'PromptFlower turns a short idea or sentence into a structured prompt ready for use with the AI model of your choice.',
      openApp: 'Open App',
      privacy: 'Privacy',
      sitePrivacy: 'Site privacy',
      viewProfile: 'View Profile',
      copyLink: 'Copy Link',
      copied: 'Copied!',
      copyFailed: 'Copy failed.',
      footerTagline: 'Hand-crafted, no framework.',
      errorRate: 'GitHub API rate limit reached. Showing cached data where possible.',
      errorLoad: 'Could not load GitHub repositories. The rest of the page remains available.'
    },
    sv: {
      codexActivityTotal: '225 avslutade svar det senaste året',
      codexActivityDate: '8 aktiva dagar · 8 oktober 2026',
      codexCalendar: 'Codex aktivitetskalender; skrolla i sidled för att se alla månader',
      codexActivityAlt: 'Codex aktivitetskalender med 225 avslutade svar fördelade på 8 aktiva dagar i sparad lokal historik, till och med 8 oktober 2026.',

      activityTitle: 'Statistik för nördar',
      activityJump: 'Utforska min aktivitet',
      currentActivity: 'Aktuell aktivitet',
      activitySnapshot: 'Sparad ögonblicksbild av aktiviteten. Följ profillänken för den senaste aktiviteten.',
      githubCalendar: 'GitHubs aktivitetskalender; skrolla i sidled för att se alla månader',
      lovableCalendar: 'Lovables aktivitetskalender; skrolla i sidled för att se alla månader',
      githubActivityTotal: '1 473 bidrag under det senaste året',
      lovableActivityTotal: '430 redigeringar under det visade året',
      githubActivityAlt: 'Aktivitetskalender från GitHub med 1 473 bidrag under det senaste året, hämtad 8 oktober 2026.',
      lovableActivityAlt: 'Sparad aktivitetskalender från Lovable med 430 redigeringar under det visade året.',
      openLovable: "Öppna Lovable-profilen (öppnas i ny flik)",
      openPF: "Öppna PromptFlower (öppnas i ny flik)",
      pfSubtitle: "Privat promptstudio",
      pfUrl: "promptflower.app / privat promptstudio",
      noScriptStats: "Aktivera JavaScript för GitHub-statistik.",
      retryLater: "GitHubs anropsgräns nådd · försök igen senare",
      sourceCachedCommit: "Repodata hämtad · cachat antal commits",
      skipContent: "Hoppa till innehåll",
      staticBio: 'Kreativ teknolog med en passion för cybersäkerhet, AI, kodning och fotografi.',
      switchLanguage: 'Byt till engelska',
      currentLanguage: 'Svenska',
      statsTitle: 'GitHub-statistik',
      live: "publikt",
      stars: 'Stjärnor',
      repos: 'Repon',
      commits: 'Commits',
      fetchingData: 'Hämtar livedata…',
      repositories: 'Repon',
      reposTitle: 'Repon',
      loading: 'Laddar…',
      statsCached: "Cachad GitHub-data",
      statsPartial: "Ofullständig GitHub-data · antal kan vara ofullständiga",
      statsUnavailable: 'GitHub-data laddad · commitantal saknas',
      statsLoaded: "GitHub-data hämtad",
      retry: 'Försök igen',
      statsOffline: 'GitHub kan inte nås just nu · visar cachad data',
      galleryTitle: 'Galleri',
      previous: 'Föregående',
      next: 'Nästa',
      noRepos: 'Inga offentliga repon hittades.',
      noDesc: 'Ingen beskrivning.',
      ofShown: (n, total) => `${n} av ${total} visade`,
      lovableKicker: 'Utvalt · Profil',
      lovableTitle: 'Lovable-profil',
      pfKicker: 'Mina appar',
      pfStudio: 'Privat promptstudio',
      pfTitle: 'Gör en snabb idé till en strukturerad superprompt.',
      pfLede: 'En privat promptstudio — med stöd för online/offline och API/lokala arbetsflöden.',
      pfBody: 'PromptFlower förvandlar en kort idé eller mening till en strukturerad prompt som är redo för valfri AI-modell.',
      openApp: 'Öppna appen',
      privacy: 'Integritet',
      sitePrivacy: 'Sidans integritet',
      viewProfile: 'Visa profil',
      copyLink: 'Kopiera länk',
      copied: 'Kopierat!',
      copyFailed: 'Kopiering misslyckades.',
      footerTagline: 'Handgjord, utan ramverk.',
      errorRate: 'GitHub API-rate limit nådd. Visar tillgänglig cachad data där det går.',
      errorLoad: 'Kunde inte läsa GitHub-repon. Resten av sidan är fortfarande tillgänglig.'
    }
  };

  let currentLang = 'en';
  let cachedRepos = null;
  let cachedStatsData = null;
  let statsAt = 0;
  let currentCache = null;
  let refreshPromise = null;

  const t = (key) => T[currentLang]?.[key] ?? T.en[key] ?? key;

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw || raw.length > 1500000) return null;

      const data = JSON.parse(raw);
      if (!data || data.v !== 5 || !Array.isArray(data.repos) || !Number.isFinite(data.t)) {
        localStorage.removeItem(CACHE_KEY);
        return null;
      }

      if (data.t > Date.now() || Date.now() - data.t > MAX_CACHE_AGE) return null;
      data.repos = normalizeRepos(data.repos);
      if (!data.stats || (data.stats.commits !== null && !isCount(data.stats.commits))) return null;
      data.statsT = Number.isFinite(data.statsT) && data.statsT <= Date.now() ? data.statsT : 0;
      data.stale = Date.now() - data.t > CACHE_TTL;
      return data;
    } catch (_) {
      return null;
    }
  }

  function writeCache(repos, stats) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        v: 5,
        t: Date.now(),
        repos,
        stats: stats ?? null,
        statsT: statsAt
      }));
    } catch (_) {}
  }

  function computeStars(repos) {
    return repos.reduce((sum, repo) => {
      const stars = Number(repo?.stargazers_count);
      return sum + (Number.isFinite(stars) ? stars : 0);
    }, 0);
  }

  function cachedStats(repos, cache) {
    return { repos: repos.length, stars: computeStars(repos), commits: cache.stats.commits,
      partial: cache.stats.partial === true, cached: true, commitCached: true };
  }

  function animateNumber(el, value) {
    if (!el) return;

    cancelAnimationFrame(numberFrames.get(el));
    const n = value == null ? NaN : Number(value);
    if (!Number.isFinite(n)) {
      el.textContent = '—';
      return;
    }

    if (REDUCED_MOTION) {
      el.textContent = Math.round(n).toLocaleString();
      return;
    }

    const duration = 750;
    const start = performance.now();

    const frame = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.round(eased * n).toLocaleString();
      if (progress < 1) numberFrames.set(el, requestAnimationFrame(frame));
    };

    numberFrames.set(el, requestAnimationFrame(frame));
  }

  function setStatsSource(key, isError = false) {
    sourceKey = key;
    sourceError = isError;
    if (!elStatsSource) return;
    elStatsSource.textContent = t(key);
    elStatsSource.classList.toggle('stats-error', isError);
  }

  function copyStatus(message) {
    if (!elActions) return;

    let status = document.getElementById('cs');
    if (!status) {
      status = document.createElement('div');
      status.id = 'cs';
      status.className = 'copy-status';
      status.setAttribute('role', 'status');
      elActions.appendChild(status);
    }

    status.textContent = message;
    status.classList.remove('is-visible');
    requestAnimationFrame(() => status.classList.add('is-visible'));
    window.setTimeout(() => status.classList.remove('is-visible'), 2000);
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      copyStatus(t('copied'));
    } catch (_) {
      copyStatus(t('copyFailed'));
    }
  }

  async function gh(url, { timeout = FETCH_TIMEOUT } = {}) {
    const endpoint = new URL(url);
    if (endpoint.origin !== GITHUB_API) throw new Error('Unexpected API origin');
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(endpoint.href, {
        method: 'GET', headers: { Accept: 'application/vnd.github+json' },
        signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer',
        redirect: 'error'
      });
      if (!response.ok) {
        const error = new Error(`GitHub API ${response.status}`);
        error.status = response.status;
        if (response.status === 403 || response.status === 429) {
          const reset = Number(response.headers.get('x-ratelimit-reset')) * 1000;
          const retry = Number(response.headers.get('retry-after')) * 1000;
          const until = Math.min(Date.now() + 3600000, Math.max(Date.now() + 60000, reset || 0, Date.now() + (retry || 0)));
          requestBlockedUntil = until;
          try { localStorage.setItem(COOLDOWN_KEY, String(until)); } catch (_) {}
        }
        throw error;
      }
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Missing API response body');
      const decoder = new TextDecoder('utf-8', { fatal: true });
      let size = 0;
      let body = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_RESPONSE_BYTES) {
            controller.abort();
            throw new Error('API response too large');
          }
          body += decoder.decode(value, { stream: true });
        }
        body += decoder.decode();
      } finally { reader.releaseLock(); }
      return { data: JSON.parse(body), link: response.headers.get('Link') || '' };
    } finally { window.clearTimeout(timer); }
  }

  async function getRepositories() {
    const repos = [];
    for (let page = 1; page <= MAX_REPO_PAGES; page++) {
      const { data, link } = await gh(`${GITHUB_API}/users/${GITHUB_USER}/repos?per_page=100&type=owner&sort=full_name&page=${page}`);
      if (!Array.isArray(data) || data.length > 100) throw new Error('Invalid repository page');
      repos.push(...normalizeRepos(data));
      const hasNext = /rel="next"/.test(link);
      if (!hasNext) return { repos: [...new Map(repos.map(repo => [repo.name, repo])).values()], partial: false };
      if (page === MAX_REPO_PAGES) return { repos, partial: true };
    }
  }

  async function getCommitSearchCount() {
    const q = encodeURIComponent(`author:${GITHUB_USER} is:public`);
    const { data } = await gh(`${GITHUB_API}/search/commits?q=${q}&per_page=1`, { timeout: 7000 });
    if (!isCount(data?.total_count) || data.incomplete_results === true) throw new Error('Incomplete commit count');
    return data.total_count;
  }

  function renderProfileActions() {
    if (!elActions) return;

    elActions.replaceChildren();

    const view = document.createElement('a');
    view.className = 'btn view';
    view.textContent = t('viewProfile');
    view.href = `https://github.com/${GITHUB_USER}`;
    view.target = '_blank';
    view.rel = 'noopener noreferrer';

    const copyButton = document.createElement('button');
    copyButton.className = 'btn copy';
    copyButton.type = 'button';
    copyButton.textContent = t('copyLink');
    copyButton.addEventListener('click', () => copy(view.href));

    elActions.append(view, copyButton);
  }

  function renderStaticProfile() {
    if (elAvatar) {
      elAvatar.alt = 'Daugavan — Marcus, builder behind PromptFlower';
    }
    if (elName) elName.textContent = 'Daugavan';
    if (elLoginLine) elLoginLine.textContent = `github.com/${GITHUB_USER}`;
    if (elBio) elBio.textContent = t('staticBio');
    renderProfileActions();
  }

  function renderStats(stats) {
    animateNumber(elReposN, stats.repos);
    animateNumber(elStarsN, stats.stars);
    animateNumber(elCommitsN, stats.commits);

    const base = Math.max(
      Number(stats.repos) || 0,
      Number(stats.stars) || 0,
      Number(stats.commits) || 0,
      1
    );

    if (elProgress) {
      const ratio = Math.min(100, ((Number(stats.repos) || 0) / base) * 100);
      requestAnimationFrame(() => {
        elProgress.style.width = `${ratio}%`;
      });
    }

    if (stats.partial) setStatsSource('statsPartial', true);
    else if (stats.cached) setStatsSource('statsCached');
    else if (stats.commits == null) setStatsSource('statsUnavailable', true);
    else if (stats.commitCached) setStatsSource('sourceCachedCommit');
    else setStatsSource('statsLoaded');
  }

  function renderRetryButton() {
    if (!elStatsSource || document.getElementById('retryGitHub')) return;

    const button = document.createElement('button');
    button.id = 'retryGitHub';
    button.type = 'button';
    button.className = 'stats-retry';
    button.textContent = t('retry');
    button.addEventListener('click', () => {
      button.disabled = true;
      refreshGitHub({ forceCommitRefresh: true })
        .finally(() => { button.disabled = false; });
    });

    elStatsSource.appendChild(document.createTextNode(' '));
    elStatsSource.appendChild(button);
  }

  function formatDate(iso) {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    const locale = currentLang === 'sv' ? 'sv-SE' : 'en-US';
    return date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function renderRepos(repos, total = repos.length) {
    cachedRepos = repos;

    const visible = [...repos]
      .sort((a, b) => (Number(b?.stargazers_count) || 0) - (Number(a?.stargazers_count) || 0))
      .slice(0, MAX_REPOS);

    if (!elReposWrap) return;

    elReposWrap.replaceChildren();

    if (!visible.length) {
      const empty = document.createElement('div');
      empty.className = 'repo-empty';
      empty.textContent = t('noRepos');
      elReposWrap.appendChild(empty);
    } else {
      visible.forEach((repo) => {
        const anchor = document.createElement('a');
        anchor.className = 'repo';
        anchor.href = `https://github.com/${GITHUB_USER}/${encodeURIComponent(repo.name)}`;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.setAttribute(
          'aria-label',
          `${repo.name} — ${repo.description || t('noDesc')}`
        );

        const language = repo.language || '';
        const topicTags = Array.isArray(repo.topics)
          ? repo.topics
              .slice(0, 4)
              .map((topic) => `<span class="repo-topic">${esc(topic)}</span>`)
              .join('')
          : '';

        const langTag = language
          ? `<span class="repo-lang"><i class="lang-dot" data-lang="${esc(language)}"></i>${esc(language)}</span>`
          : '';

        const starCount = Number(repo.stargazers_count) || 0;
        const updated = formatDate(repo.updated_at);

        anchor.innerHTML = `
          <div class="repo-head">
            <div class="repo-title">
              <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                <path fill="currentColor" d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>
              </svg>
              ${esc(repo.name)}
            </div>
            <div class="repo-star">
              ${starCount}
              <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
                <path fill="currentColor" d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"/>
              </svg>
            </div>
          </div>
          <div class="repo-desc">${esc(repo.description || t('noDesc'))}</div>
          <div class="repo-foot">
            ${langTag}
            <div class="repo-topics">${topicTags}</div>
            <time datetime="${esc(repo.updated_at || '')}">${esc(updated)}</time>
          </div>`;

        elReposWrap.appendChild(anchor);
      });
    }

    if (elRepoCount) {
      elRepoCount.textContent = t('ofShown')(visible.length, total);
    }

    elReposWrap.setAttribute('aria-busy', 'false');
  }

  function renderError(key, { cached = false } = {}) {
    setStatsSource(key, true);

    if (cached && cachedStatsData) {
      renderStats(cachedStatsData);
      setStatsSource(key, true);
      renderRetryButton();
      return;
    }

    if (elReposWrap) {
      const errorBox = document.createElement('div');
      errorBox.className = 'api-error';
      errorBox.textContent = t(key);
      errorBox.setAttribute('data-i18n', key);
      if (elRepoCount) elRepoCount.textContent = '—';
      elReposWrap.replaceChildren(errorBox);
      elReposWrap.setAttribute('aria-busy', 'false');
    }

    renderRetryButton();
  }

  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach((element) => {
      element.textContent = t(element.getAttribute('data-i18n'));
    });


    document.querySelectorAll('[data-i18n-aria]').forEach((element) => {
      element.setAttribute('aria-label', t(element.getAttribute('data-i18n-aria')));
    });
    document.querySelectorAll('[data-i18n-alt]').forEach((element) => {
      element.setAttribute('alt', t(element.getAttribute('data-i18n-alt')));
    });


    if (cachedRepos) {
      renderRepos(cachedRepos, cachedRepos.length);
    }

    renderProfileActions();
    if (elBio) elBio.textContent = t('staticBio');
    elCommitsN?.setAttribute('title', currentLang === 'sv' ? 'Publika commits som GitHubs sökindex tillskriver Daugavan; inte alla privata commits eller alla grenar.' : 'Public commits attributed to Daugavan by GitHub search; not private commits or every branch.');
    const hadRetry = !!document.getElementById('retryGitHub');
    setStatsSource(sourceKey, sourceError);
    if (hadRetry) renderRetryButton();
    document.dispatchEvent(new Event('languagechange'));

    if (langSwitch) {
      langSwitch.setAttribute('aria-label', t('switchLanguage'));
      const showSv = currentLang !== 'sv';
      if (flagSv) flagSv.hidden = !showSv;
      if (flagUs) flagUs.hidden = showSv;
    }
  }

  function setLanguage(lang) {
    currentLang = lang === 'sv' ? 'sv' : 'en';
    document.documentElement.lang = currentLang === 'sv' ? 'sv-SE' : 'en';

    try {
      localStorage.setItem('lang', currentLang);
    } catch (_) {}

    applyTranslations();
  }

  function initLanguage() {
    let stored = null;

    try {
      stored = localStorage.getItem('lang');
    } catch (_) {}

    currentLang =
      stored === 'sv' || stored === 'en'
        ? stored
        : navigator.languages?.some((language) =>
            language.toLowerCase().startsWith('sv')
          )
          ? 'sv'
          : 'en';

    setLanguage(currentLang);

    langSwitch?.addEventListener('click', () => {
      setLanguage(currentLang === 'sv' ? 'en' : 'sv');
    });
  }

  async function refreshGitHub({ forceCommitRefresh = false } = {}) {
    if (refreshPromise) return refreshPromise;
    if (Date.now() < cooldownUntil()) {
      renderError('retryLater', { cached: !!cachedStatsData });
      return;
    }
    refreshPromise = (async () => {
      try {
        const { repos, partial: reposPartial } = await getRepositories();
        renderRepos(repos);
        let commits = currentCache?.stats?.commits ?? null;
        const commitCacheFresh = !forceCommitRefresh && isCount(commits) &&
          Date.now() - Number(currentCache?.statsT || 0) <= COMMIT_STATS_TTL;
        cachedStatsData = { repos: repos.length, stars: computeStars(repos), commits,
          partial: reposPartial, cached: false, commitCached: commits !== null };
        renderStats(cachedStatsData);
        let commitFailed = false;
        if (!commitCacheFresh) {
          try { commits = await getCommitSearchCount(); statsAt = Date.now(); }
          catch (_) { commitFailed = true; }
        } else { statsAt = currentCache.statsT; }
        const nextStats = { repos: repos.length, stars: computeStars(repos), commits,
          partial: reposPartial || commitFailed, cached: false,
          commitCached: commitCacheFresh || (commitFailed && commits !== null) };
        cachedStatsData = nextStats;
        currentCache = { v: 5, t: Date.now(), repos, stats: nextStats, statsT: statsAt };
        renderStats(nextStats);
        writeCache(repos, nextStats);
        if (commitFailed) renderRetryButton();
      } catch (error) {
        renderError(error?.status === 403 || error?.status === 429 ? 'errorRate' : 'errorLoad',
          { cached: !!cachedStatsData });
      }
    })();
    try { await refreshPromise; } finally { refreshPromise = null; }
  }

  async function main() {
    if (langSwitch) langSwitch.hidden = false;
    initLanguage();
    renderStaticProfile();
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const touchScreen = window.matchMedia('(hover: none), (pointer: coarse), (max-width: 640px)');
    const background = document.querySelector('.bg-svg');
    const syncMotion = () => {
      if (document.hidden || motion.matches || touchScreen.matches) background?.pauseAnimations?.();
      else background?.unpauseAnimations?.();
    };
    motion.addEventListener?.('change', syncMotion);
    touchScreen.addEventListener?.('change', syncMotion);
    document.addEventListener('visibilitychange', syncMotion);
    syncMotion();

    if (elMainContent) elMainContent.setAttribute('aria-busy', 'true');

    currentCache = readCache();

    if (currentCache) {
      cachedRepos = currentCache.repos;
      cachedStatsData = cachedStats(currentCache.repos, currentCache);
      statsAt = Number(currentCache.statsT) || 0;

      renderRepos(currentCache.repos, currentCache.repos.length);
      renderStats(cachedStatsData);

      if (currentCache.stale) {
        setStatsSource('statsCached');
      }
    }

    const refresh = () => refreshGitHub();

    if (currentCache && !currentCache.stale) {
      if (cachedStatsData.partial) renderRetryButton();
    } else if ('requestIdleCallback' in window) {
      window.requestIdleCallback(refresh, {
        timeout: currentCache ? 1200 : 0
      });
    } else {
      window.setTimeout(refresh, currentCache ? 250 : 0);
    }

    const elYear = document.getElementById('year');
    if (elYear) elYear.textContent = String(new Date().getFullYear());

    if (elMainContent) elMainContent.setAttribute('aria-busy', 'false');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main, { once: true });
  } else {
    main();
  }
})();


(() => {
  'use strict';
  const groups = [...document.querySelectorAll('.gallery .gallery-spread')];
  if (!groups.length) return;
  const images = groups.map((_, i) => ({
    webp: `images/Portfolio (${i + 1}).webp`,
    jpg: `images/Portfolio (${i + 1}).jpg`,
    width: 1600, height: [1, 3, 5].includes(i + 1) ? 1067 : 900
  }));
  const words = () => document.documentElement.lang.startsWith('sv')
    ? { open: 'Öppna portfoliobild', close: 'Stäng', prev: 'Föregående bild', next: 'Nästa bild', title: 'Förstorad galleribild', error: 'Bilden kunde inte laddas.', photo: 'Portfoliobild' }
    : { open: 'Open portfolio image', close: 'Close', prev: 'Previous image', next: 'Next image', title: 'Enlarged gallery image', error: 'The image could not be loaded.', photo: 'Portfolio image' };
  let current = 0;
  let lastFocus = null;
  let dialog = null;
  let touchStart = null;
  let renderVersion = 0;

  function render() {
    const version = ++renderVersion;
    const item = images[current];
    const text = words();
    const pic = dialog.querySelector('img');
    const caption = dialog.querySelector('figcaption');
    dialog.setAttribute('aria-label', text.title);
    dialog.querySelector('.g-lightbox-close').setAttribute('aria-label', text.close);
    dialog.querySelector('.g-lightbox-prev').setAttribute('aria-label', text.prev);
    dialog.querySelector('.g-lightbox-next').setAttribute('aria-label', text.next);
    pic.alt = `${text.photo} ${current + 1}`;
    pic.width = item.width;
    pic.height = item.height;
    caption.textContent = `${text.photo} ${current + 1} / ${images.length}`;
    let fallback = false;
    pic.onerror = () => {
      if (version !== renderVersion) return;
      if (!fallback) { fallback = true; pic.src = encodeURI(item.jpg); }
      else { caption.textContent = text.error; pic.onerror = null; }
    };
    pic.src = encodeURI(item.webp);
  }

  function move(delta) {
    current = (current + delta + images.length) % images.length;
    render();
  }

  function close() {
    if (!dialog) return;
    dialog.close();
  }

  function open(index, source) {
    if (dialog) return;
    current = (index + images.length) % images.length;
    lastFocus = source;
    dialog = document.createElement('dialog');
    if (typeof dialog.showModal !== 'function') {
      dialog = null;
      window.location.assign(encodeURI(images[current].webp));
      return;
    }
    dialog.className = 'g-lightbox is-open';
    dialog.innerHTML = `
      <button class="g-lightbox-btn g-lightbox-close" type="button" autofocus>✕</button>
      <figure><img class="g-lightbox-pic" alt="" decoding="async"><figcaption aria-live="polite"></figcaption></figure>
      <div class="g-lightbox-nav">
        <button class="g-lightbox-btn g-lightbox-prev" type="button"><span class="gallery-arrow gallery-arrow-prev" aria-hidden="true"></span></button>
        <button class="g-lightbox-btn g-lightbox-next" type="button"><span class="gallery-arrow gallery-arrow-next" aria-hidden="true"></span></button>
      </div>`;
    dialog.querySelector('.g-lightbox-close').addEventListener('click', close);
    dialog.querySelector('.g-lightbox-prev').addEventListener('click', () => move(-1));
    dialog.querySelector('.g-lightbox-next').addEventListener('click', () => move(1));
    dialog.addEventListener('click', event => { if (event.target === dialog) close(); });
    dialog.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
        event.preventDefault();
        move(event.key === 'ArrowRight' ? 1 : -1);
      }
    });
    dialog.addEventListener('touchstart', event => {
      touchStart = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    }, { passive: true });
    dialog.addEventListener('touchend', event => {
      if (!touchStart || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touchStart.x;
      const dy = event.changedTouches[0].clientY - touchStart.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
      touchStart = null;
    }, { passive: true });
    dialog.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
    dialog.addEventListener('close', () => {
      renderVersion++;
      dialog.remove();
      dialog = null;
      document.body.classList.remove('lightbox-open');
      lastFocus?.focus({ preventScroll: true });
    }, { once: true });
    document.body.appendChild(dialog);
    document.body.classList.add('lightbox-open');
    render();
    dialog.showModal();
  }

  const translate = () => {
    groups.forEach((group, i) => group.setAttribute('aria-label', `${words().open} ${i + 1}`));
    if (dialog) render();
  };
  groups.forEach((group, index) => {
    group.tabIndex = 0;
    group.setAttribute('role', 'button');
    group.querySelectorAll('.gallery-plane').forEach(tile => tile.setAttribute('aria-hidden', 'true'));
    group.addEventListener('click', () => open(index, group));
    group.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(index, group); }
    });
  });
  document.addEventListener('languagechange', translate);
  translate();
  const previous = document.querySelector('.gallery-nav .prev');
  const next = document.querySelector('.gallery-nav .next');
  if (previous) { previous.hidden = false; previous.addEventListener('click', () => open(current - 1, previous)); }
  if (next) { next.hidden = false; next.addEventListener('click', () => open(current + 1, next)); }
})();

(() => {
  'use strict';
  const header = document.querySelector('.identity');
  if (!header || typeof ResizeObserver === 'undefined') return;
  const source = new Image();
  const unlit = new Image();
  source.src = 'images/identity-cover.webp';
  unlit.src = 'images/identity-lamps-off.webp';

  Promise.all([source.decode(), unlit.decode()]).then(() => {
    const shade = document.createElement('span');
    shade.className = 'streetlight-shade';
    shade.setAttribute('aria-hidden', 'true');
    header.prepend(shade);
    let on = true;
    const buttons = [715, 886].map((x, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'streetlight-toggle';
      button.addEventListener('click', () => {
        on = !on;
        header.classList.toggle('lamps-off', !on);
        labels();
      });
      header.appendChild(button);
      return { button, x, index };
    });

    function labels() {
      const swedish = document.documentElement.lang.startsWith('sv');
      const action = swedish
        ? (on ? 'Släck båda gatlyktorna' : 'Tänd båda gatlyktorna')
        : (on ? 'Turn both streetlights off' : 'Turn both streetlights on');
      buttons.forEach(({ button, index }) => {
        const side = swedish ? (index ? 'Höger lykta' : 'Vänster lykta')
          : (index ? 'Right streetlight' : 'Left streetlight');
        button.setAttribute('aria-label', side + ': ' + action);
        button.setAttribute('aria-pressed', String(on));
        button.title = action;
      });
    }

    function layout() {
      const width = header.clientWidth;
      const height = header.clientHeight;
      const scale = Math.max(width / source.naturalWidth, height / source.naturalHeight);
      const offsetX = (width - source.naturalWidth * scale) / 2;
      const positionY = parseFloat(getComputedStyle(header).backgroundPositionY) / 100;
      const offsetY = (height - source.naturalHeight * scale) * positionY;
      header.style.setProperty('--lamp-mask-x', (55 * scale) + 'px');
      header.style.setProperty('--lamp-mask-y', (65 * scale) + 'px');
      header.style.setProperty('--lamp-mask-top', (offsetY + 95 * scale) + 'px');
      header.style.setProperty('--lamp-target', (44 * scale) + 'px');
      buttons.forEach(({ button, x, index }) => {
        const left = offsetX + x * scale;
        header.style.setProperty(index ? '--lamp-right-x' : '--lamp-left-x', left + 'px');
        button.style.left = left + 'px';
        button.style.top = (offsetY + 72 * scale) + 'px';
      });
    }
    labels();
    layout();
    new ResizeObserver(layout).observe(header);
    document.addEventListener('languagechange', labels);
  }).catch(() => {  });
})();

(() => {
  'use strict';
  const header = document.querySelector('.identity');
  const crop = document.querySelector('.identity-crop');
  if (!header || !crop || typeof ResizeObserver === 'undefined') return;
  const source = new Image();
  source.src = 'images/identity-cover.webp';
  source.decode().then(() => {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'portrait-contact';
    trigger.setAttribute('aria-label', 'Visa kontaktuppgifter');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', 'portrait-contact-bubble');
    header.appendChild(trigger);

    const bubble = document.createElement('div');
    bubble.id = 'portrait-contact-bubble';
    bubble.className = 'contact-bubble';
    bubble.hidden = true;
    bubble.inert = true;
    bubble.setAttribute('role', 'region');
    bubble.setAttribute('aria-label', 'Kontaktuppgifter');
    bubble.setAttribute('aria-hidden', 'true');
    const surface = document.createElement('span');
    surface.className = 'contact-bubble-surface';
    surface.setAttribute('aria-hidden', 'true');
    const message = document.createElement('p');
    message.textContent = 'Vill du kontakta mig?';
    const email = document.createElement('a');
    email.href = 'mailto:daugavan@pr0t0nmail.com';
    email.textContent = 'daugavan@pr0t0nmail.com';
    const emailLine = document.createElement('div');
    emailLine.className = 'contact-bubble-email';
    emailLine.appendChild(email);
    bubble.append(surface, message, emailLine);
    document.body.appendChild(bubble);

    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let isOpen = false;
    let closeTimer;

    function finishClose() {
      if (isOpen) return;
      clearTimeout(closeTimer);
      bubble.hidden = true;
      bubble.classList.remove('is-closing');
    }
    function close() {
      if (!isOpen) return;
      isOpen = false;
      trigger.setAttribute('aria-expanded', 'false');
      if (bubble.contains(document.activeElement)) {
        if (trigger.hidden) email.blur();
        else trigger.focus({ preventScroll: true });
      }
      bubble.inert = true;
      bubble.setAttribute('aria-hidden', 'true');
      bubble.classList.remove('is-open');
      bubble.classList.add('is-closing');
      if (motion.matches || trigger.hidden) return finishClose();
      closeTimer = setTimeout(finishClose, 200);
    }
    function open() {
      clearTimeout(closeTimer);
      const wasHidden = bubble.hidden;
      isOpen = true;
      bubble.hidden = false;
      bubble.inert = false;
      bubble.removeAttribute('aria-hidden');
      if (wasHidden) {
        bubble.classList.remove('is-closing', 'is-resuming');
        positionBubble();
      } else {
        bubble.classList.add('is-resuming');
      }
      bubble.classList.remove('is-closing');
      bubble.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
    }
    function positionBubble() {
      const target = trigger.getBoundingClientRect();
      const frame = crop.getBoundingClientRect();
      const right = Math.min(target.right, frame.right);
      const top = Math.max(target.top, frame.top);
      const bottom = Math.min(target.bottom, frame.bottom);
      const width = bubble.offsetWidth;
      const height = bubble.offsetHeight;
      const left = Math.max(16, Math.min(right - 12, innerWidth - width - 16));
      const y = Math.max(16, Math.min(top + (bottom - top) * .35 - height / 2, innerHeight - height - 16));
      bubble.style.left = left + 'px';
      bubble.style.top = y + 'px';
    }
    function layout() {
      const width = header.clientWidth;
      const height = header.clientHeight;
      const scale = Math.max(width / source.naturalWidth, height / source.naturalHeight);
      const offsetX = (width - source.naturalWidth * scale) / 2;
      const positionY = parseFloat(getComputedStyle(header).backgroundPositionY) / 100;
      const offsetY = (height - source.naturalHeight * scale) * positionY;
      const left = offsetX + 80 * scale;
      const size = 352 * scale;
      trigger.style.left = left + 'px';
      trigger.style.top = (offsetY + 174 * scale) + 'px';
      trigger.style.width = size + 'px';
      trigger.style.height = size + 'px';
      trigger.hidden = Math.min(left + size, width) - Math.max(left, 0) < 44;
      if (trigger.hidden) close();
      else if (!bubble.hidden) positionBubble();
    }
    trigger.addEventListener('click', () => {
      if (isOpen) close();
      else open();
    });
    document.addEventListener('pointerdown', event => {
      if (isOpen && !bubble.contains(event.target) && !trigger.contains(event.target)) close();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && isOpen) {
        close();
        trigger.focus({ preventScroll: true });
      }
    });
    document.addEventListener('focusin', event => {
      if (isOpen && !bubble.contains(event.target) && event.target !== trigger) close();
    });
    trigger.addEventListener('keydown', event => {
      if (event.key === 'Tab' && !event.shiftKey && isOpen) {
        event.preventDefault();
        email.focus({ preventScroll: true });
      }
    });
    surface.addEventListener('transitionend', event => {
      if (event.target === surface && event.propertyName === 'opacity' && !isOpen &&
          getComputedStyle(surface).opacity === '0') finishClose();
    });
    motion.addEventListener('change', () => {
      if (motion.matches && !isOpen) finishClose();
    });
    window.addEventListener('scroll', () => { if (!bubble.hidden) positionBubble(); }, { passive: true });
    window.addEventListener('resize', layout, { passive: true });
    new ResizeObserver(layout).observe(header);
    layout();
  }).catch(() => {  });
})();


(() => {
  'use strict';

  const ACCESS_PATH = '/klienter/access.html';
  const ACCESS_KEY = 'daugavanClientAccessV1';
  const PASSWORD_SHA256 = '5e5b76c8ae35d7ecf95f0ae3d9ea40b7a9d05c537aafbfd536556bfbafdcb8d5';
  const GATE_PATH = `${location.pathname}${location.search}${location.hash}`;

  const safeReturnPath = value => {
    try {
      const target = new URL(value || '/klienter/', location.origin);
      if (target.origin !== location.origin || !target.pathname.startsWith('/klienter/') ||
          target.pathname === ACCESS_PATH || target.pathname.startsWith(`${ACCESS_PATH}/`)) {
        return '/klienter/';
      }
      return `${target.pathname}${target.search}${target.hash}`;
    } catch {
      return '/klienter/';
    }
  };

  const redirectToGate = target => {
    location.replace(`${ACCESS_PATH}?return=${encodeURIComponent(target)}`);
  };

  const sha256 = async value => {
    const bytes = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  };

  if (location.pathname === ACCESS_PATH) {
    document.addEventListener('DOMContentLoaded', () => {
      const form = document.querySelector('#client-access-form');
      const input = document.querySelector('#client-access-password');
      const submit = document.querySelector('#client-access-submit');
      const message = document.querySelector('#client-access-message');
      const target = safeReturnPath(new URLSearchParams(location.search).get('return'));
      if (!form || !input || !submit || !message) return;

      form.addEventListener('submit', async event => {
        event.preventDefault();
        const password = input.value;
        input.value = '';
        message.textContent = '';
        submit.disabled = true;

        try {
          if (await sha256(password) !== PASSWORD_SHA256) {
            message.textContent = 'Fel lösenord. Försök igen.';
            input.focus();
            return;
          }
          try {
            sessionStorage.setItem(ACCESS_KEY, 'granted');
          } catch {
            message.textContent = 'Upplåsningen kunde inte sparas i den här fliken.';
            input.focus();
            return;
          }
          location.replace(target);
        } catch {
          message.textContent = 'Lösenordet kunde inte kontrolleras i den här webbläsaren.';
          input.focus();
        } finally {
          submit.disabled = false;
        }
      });
    }, { once: true });
    return;
  }

  if (!location.pathname.startsWith('/klienter/')) return;
  try {
    if (sessionStorage.getItem(ACCESS_KEY) === 'granted') {
      document.documentElement.classList.remove('client-access-pending');
      return;
    }
  } catch {
    // The gate remains closed when tab storage is unavailable.
  }
  redirectToGate(GATE_PATH);
})();

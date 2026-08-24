'use strict';

(() => {
  const DEFAULT_BASE_URL = 'https://project-y-yos-ai.vercel.app';
  const GOOGLE_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
  const EXPIRY_MARGIN_SECONDS = 60;
  let publicConfigPromise;
  let googleLibraryPromise;
  let credential = '';
  let credentialExpiresAt = 0;
  let pendingCredential;

  globalThis.YOS_AI_BASE_URL = typeof globalThis.YOS_AI_BASE_URL === 'string' && globalThis.YOS_AI_BASE_URL.trim()
    ? globalThis.YOS_AI_BASE_URL.trim()
    : DEFAULT_BASE_URL;

  function status(message) {
    const target = document.getElementById('rawSavedMessage');
    if (target) target.textContent = message;
  }

  async function loadPublicConfig() {
    publicConfigPromise ||= fetch(new URL('/api/yos/public-config', globalThis.YOS_AI_BASE_URL), {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw Object.assign(new Error('YOS public config is unavailable'), { status: response.status });
      const clientId = typeof body.googleClientId === 'string' ? body.googleClientId.trim() : '';
      if (!clientId.endsWith('.apps.googleusercontent.com')) {
        throw Object.assign(new Error('Google client is unavailable'), { status: 503 });
      }
      return { googleClientId: clientId };
    });
    return publicConfigPromise;
  }

  function loadGoogleLibrary() {
    if (globalThis.google?.accounts?.id) return Promise.resolve(globalThis.google.accounts.id);
    googleLibraryPromise ||= new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT_URL}"]`);
      const script = existing || document.createElement('script');
      const timeout = setTimeout(() => reject(Object.assign(new Error('Google sign-in timed out'), { status: 0 })), 15000);
      const ready = () => {
        clearTimeout(timeout);
        if (globalThis.google?.accounts?.id) resolve(globalThis.google.accounts.id);
        else reject(Object.assign(new Error('Google sign-in is unavailable'), { status: 0 }));
      };
      script.addEventListener('load', ready, { once: true });
      script.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(Object.assign(new Error('Google sign-in is unavailable'), { status: 0 }));
      }, { once: true });
      if (!existing) {
        script.src = GOOGLE_SCRIPT_URL;
        script.async = true;
        script.defer = true;
        script.referrerPolicy = 'strict-origin-when-cross-origin';
        document.head.appendChild(script);
      }
    });
    return googleLibraryPromise;
  }

  function decodeExpiry(token) {
    try {
      const payload = token.split('.')[1];
      if (!payload) return 0;
      const normalized = payload.replace(/-/gu, '+').replace(/_/gu, '/').padEnd(Math.ceil(payload.length / 4) * 4, '=');
      const value = JSON.parse(atob(normalized));
      return Number(value.exp) || 0;
    } catch {
      return 0;
    }
  }

  async function getGoogleIdToken() {
    const now = Math.floor(Date.now() / 1000);
    if (credential && credentialExpiresAt > now + EXPIRY_MARGIN_SECONDS) return credential;
    if (pendingCredential) return pendingCredential;

    status('原文は保存済みです。GoogleでYOS AIへ接続してください。');
    pendingCredential = Promise.all([loadPublicConfig(), loadGoogleLibrary()])
      .then(([config, googleId]) => new Promise((resolve, reject) => {
        const host = document.getElementById('googleSignIn');
        const button = document.getElementById('googleSignInButton');
        if (!host || !button) {
          reject(Object.assign(new Error('Google sign-in UI is unavailable'), { status: 503 }));
          return;
        }
        host.hidden = false;
        button.replaceChildren();
        googleId.initialize({
          client_id: config.googleClientId,
          callback: (response) => {
            const token = typeof response?.credential === 'string' ? response.credential.trim() : '';
            if (!token) {
              reject(Object.assign(new Error('Google sign-in failed'), { status: 401 }));
              return;
            }
            credential = token;
            credentialExpiresAt = decodeExpiry(token);
            host.hidden = true;
            button.replaceChildren();
            resolve(token);
          },
          auto_select: false,
          cancel_on_tap_outside: true,
          context: 'signin',
          itp_support: true,
          use_fedcm_for_prompt: true
        });
        googleId.renderButton(button, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'left',
          width: Math.min(320, Math.max(220, Math.floor(host.getBoundingClientRect().width - 24)))
        });
        googleId.prompt();
      }))
      .finally(() => { pendingCredential = null; });
    return pendingCredential;
  }

  globalThis.YOS_AUTH = Object.freeze({ getGoogleIdToken });
})();

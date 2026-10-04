'use strict';

(() => {
  const FALLBACK = 'https://project-y-yos-ai.vercel.app';
  const CACHE_MS = 5 * 60 * 1000;
  const scriptUrl = document.currentScript?.src || new URL('./runtime-provider-router.js', location.href).href;
  const configUrl = new URL('../data/yos-runtime-providers.json', scriptUrl).href;
  let cached = null;
  let cachedAt = 0;
  let activeBase = '';

  function cleanBase(value) {
    try {
      const url = new URL(String(value || '').trim());
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) return '';
      return url.origin;
    } catch {
      return '';
    }
  }

  function routeName(value) {
    return String(value || '').trim().replace(/^\/api\/yos\//, '').split(/[?#]/, 1)[0];
  }

  async function load() {
    if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
    try {
      const response = await fetch(configUrl + '?t=' + Date.now(), {cache: 'no-store', credentials: 'omit'});
      if (!response.ok) throw new Error('provider config unavailable');
      const value = await response.json();
      if (!value || value.schema_version !== '1.0.0' || !Array.isArray(value.providers)) throw new Error('provider config invalid');
      cached = value;
      cachedAt = Date.now();
      return value;
    } catch {
      return {
        schema_version: '1.0.0',
        providers: [{id: 'vercel', base_url: FALLBACK, enabled: true, certified_routes: ['chat', 'health', 'public-config', 'nav-model', 'taxi-event']}]
      };
    }
  }

  async function getBaseUrls(route) {
    const emergency = cleanBase(globalThis.YOS_AI_BASE_URL);
    if (emergency && emergency !== FALLBACK) return [emergency];

    const name = routeName(route);
    const config = await load();
    const urls = [];
    for (const provider of config.providers) {
      if (!provider?.enabled || !Array.isArray(provider.certified_routes) || !provider.certified_routes.includes(name)) continue;
      const base = cleanBase(provider.base_url);
      if (base && !urls.includes(base)) urls.push(base);
    }
    if (!urls.includes(FALLBACK)) urls.push(FALLBACK);
    if (activeBase && urls.includes(activeBase)) {
      return [activeBase, ...urls.filter((value) => value !== activeBase)];
    }
    return urls;
  }

  function reportSuccess(baseUrl) {
    const value = cleanBase(baseUrl);
    if (value) activeBase = value;
  }

  function invalidate() {
    cached = null;
    cachedAt = 0;
    activeBase = '';
  }

  globalThis.YOS_RUNTIME_PROVIDERS = Object.freeze({
    getBaseUrls,
    reportSuccess,
    invalidate,
    configUrl
  });

  globalThis.addEventListener?.('yos-ai-transport-change', invalidate);
})();

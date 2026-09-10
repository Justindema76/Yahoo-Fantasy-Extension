(() => {
  'use strict';

  const nativeFetch = globalThis.fetch.bind(globalThis);
  const YAHOO_DELAY_MS = 900;
  let yahooQueue = Promise.resolve();
  let lastYahooRequestAt = 0;

  function normalizeObjectArray(value) {
    if (!Array.isArray(value) || !value.length || !value.every(row => row && typeof row === 'object' && !Array.isArray(row))) return value;
    const keys = [...new Set(value.flatMap(row => Object.keys(row)))];
    return value.map(row => Object.fromEntries(keys.map(key => [key, row[key] === undefined ? null : row[key]])));
  }

  function normalizeBody(body) {
    if (typeof body !== 'string' || !body.trim().startsWith('[')) return body;
    try { return JSON.stringify(normalizeObjectArray(JSON.parse(body))); }
    catch { return body; }
  }

  function fixYahooPlayersUrl(url) {
    if (typeof url !== 'string' || !/\/f1\/497223\/players\?/i.test(url)) return url;
    return url.replace(/([?&]stat1=)P_W_(\d+)/i, '$1S_PW_$2');
  }

  function isYahooLeagueRequest(url, method) {
    return method === 'GET' && /https:\/\/football\.fantasysports\.yahoo\.com\/f1\/497223(?:\/|\?|$)/i.test(url);
  }

  async function waitForYahooSlot() {
    const elapsed = Date.now() - lastYahooRequestAt;
    if (elapsed < YAHOO_DELAY_MS) await new Promise(resolve => setTimeout(resolve, YAHOO_DELAY_MS - elapsed));
    lastYahooRequestAt = Date.now();
  }

  function pacedYahooFetch(input, init) {
    const job = yahooQueue.then(async () => {
      await waitForYahooSlot();
      const response = await nativeFetch(input, init);
      if (response.status === 999 || response.status === 429) {
        throw new Error('Yahoo temporarily rate-limited the sync. Stop syncing and let Yahoo cool down before trying again.');
      }
      return response;
    });
    yahooQueue = job.catch(() => {});
    return job;
  }

  globalThis.fetch = (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();
    const fixedUrl = fixYahooPlayersUrl(rawUrl);
    const fixedInput = typeof input === 'string' ? fixedUrl : input;

    if (method === 'POST' && /bbodmhffnqebhfksjier\.supabase\.co\/rest\/v1\//i.test(rawUrl) && typeof init?.body === 'string') {
      return nativeFetch(fixedInput, { ...init, body: normalizeBody(init.body) });
    }

    if (isYahooLeagueRequest(fixedUrl, method)) return pacedYahooFetch(fixedInput, init);
    return nativeFetch(fixedInput, init);
  };
})();
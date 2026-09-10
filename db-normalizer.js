(() => {
  'use strict';

  const nativeFetch = globalThis.fetch.bind(globalThis);
  const YAHOO_DELAY_MS = 1000;
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

  function selectedWeekFromLocation() {
    try {
      const u = new URL(location.href);
      const stat = u.searchParams.get('stat1') || '';
      const statMatch = stat.match(/^S_(?:P?W)_(1[0-8]|[1-9])$/i);
      if (statMatch) return Number(statMatch[1]);
      const matchup = Number(u.searchParams.get('matchup_week'));
      if (matchup >= 1 && matchup <= 18) return matchup;
      return null;
    } catch { return null; }
  }

  function requestWeek(url) {
    try {
      const u = new URL(url, location.origin);
      const stat = u.searchParams.get('stat1') || '';
      const statMatch = stat.match(/^S_(?:P?W)_(1[0-8]|[1-9])$/i) || stat.match(/^P_W_(1[0-8]|[1-9])$/i);
      if (statMatch) return Number(statMatch[1]);
      const matchup = Number(u.searchParams.get('matchup_week'));
      return matchup >= 1 && matchup <= 18 ? matchup : null;
    } catch { return null; }
  }

  function fixYahooPlayersUrl(url) {
    if (typeof url !== 'string' || !/\/f1\/497223\/players\?/i.test(url)) return url;
    return url.replace(/([?&]stat1=)P_W_(\d+)/i, '$1S_PW_$2');
  }

  function isYahooLeagueRequest(url, method) {
    return method === 'GET' && /https:\/\/football\.fantasysports\.yahoo\.com\/f1\/497223(?:\/|\?|$)/i.test(url);
  }

  function syntheticEmptyPage() {
    return new Response('<!doctype html><html><body></body></html>', {status:200,headers:{'Content-Type':'text/html; charset=utf-8'}});
  }

  function shouldSkipOffWeek(url) {
    const selected = selectedWeekFromLocation();
    if (!selected || !/\/f1\/497223\//i.test(url)) return false;
    const requested = requestWeek(url);
    if (!requested || requested === selected) return false;
    return /\/players\?/i.test(url) || /matchup_week=/i.test(url);
  }

  async function waitForYahooSlot() {
    const elapsed = Date.now() - lastYahooRequestAt;
    if (elapsed < YAHOO_DELAY_MS) await new Promise(resolve => setTimeout(resolve, YAHOO_DELAY_MS - elapsed));
    lastYahooRequestAt = Date.now();
  }

  async function decorateTeamsResponse(response, url) {
    const selected = selectedWeekFromLocation();
    if (!selected || !/\/f1\/497223\/teams(?:\?|$)/i.test(url) || !response.ok) return response;
    const text = await response.text();
    const marker = `<select id="fantasy-intel-selected-week"><option selected>Week ${selected}</option></select>`;
    const html = /<\/body>/i.test(text) ? text.replace(/<\/body>/i, `${marker}</body>`) : `${text}${marker}`;
    return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  }

  function pacedYahooFetch(input, init, fixedUrl) {
    if (shouldSkipOffWeek(fixedUrl)) return Promise.resolve(syntheticEmptyPage());
    const job = yahooQueue.then(async () => {
      await waitForYahooSlot();
      const response = await nativeFetch(input, init);
      if (response.status === 999 || response.status === 429) throw new Error('Yahoo temporarily rate-limited the sync. Stop syncing and let Yahoo cool down before trying again.');
      return decorateTeamsResponse(response, fixedUrl);
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

    if (isYahooLeagueRequest(fixedUrl, method)) return pacedYahooFetch(fixedInput, init, fixedUrl);
    return nativeFetch(fixedInput, init);
  };
})();
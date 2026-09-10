(() => {
  'use strict';

  const nativeFetch = globalThis.fetch.bind(globalThis);

  function normalizeObjectArray(value) {
    if (!Array.isArray(value) || !value.length || !value.every(row => row && typeof row === 'object' && !Array.isArray(row))) {
      return value;
    }

    const keys = [...new Set(value.flatMap(row => Object.keys(row)))];
    return value.map(row => Object.fromEntries(keys.map(key => [key, row[key] === undefined ? null : row[key]])));
  }

  function normalizeBody(body) {
    if (typeof body !== 'string' || !body.trim().startsWith('[')) return body;
    try {
      return JSON.stringify(normalizeObjectArray(JSON.parse(body)));
    } catch {
      return body;
    }
  }

  function fixYahooPlayersUrl(url) {
    if (typeof url !== 'string' || !/\/f1\/497223\/players\?/i.test(url)) return url;
    // Yahoo's projected-week selector uses S_PW_<week> (for example S_PW_1).
    return url.replace(/([?&]stat1=)P_W_(\d+)/i, '$1S_PW_$2');
  }

  globalThis.fetch = (input, init = {}) => {
    const rawUrl = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();
    const fixedInput = typeof input === 'string' ? fixYahooPlayersUrl(input) : input;

    if (method === 'POST' && /bbodmhffnqebhfksjier\.supabase\.co\/rest\/v1\//i.test(rawUrl) && typeof init?.body === 'string') {
      return nativeFetch(fixedInput, { ...init, body: normalizeBody(init.body) });
    }

    return nativeFetch(fixedInput, init);
  };
})();

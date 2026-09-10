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

  globalThis.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input?.url || '';
    const method = String(init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase();

    if (method === 'POST' && /bbodmhffnqebhfksjier\.supabase\.co\/rest\/v1\//i.test(url) && typeof init?.body === 'string') {
      return nativeFetch(input, { ...init, body: normalizeBody(init.body) });
    }

    return nativeFetch(input, init);
  };
})();

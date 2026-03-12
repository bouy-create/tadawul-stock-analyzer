const store = new Map();
const DEFAULT_TTL_MS = 60 * 1000;
const MAX_ENTRIES = 300;

function getCache(key) {
  const entry = store.get(key);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }

  return entry.value;
}

function setCache(key, value, ttlMs = DEFAULT_TTL_MS) {
  if (store.size >= MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    store.delete(oldestKey);
  }

  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

module.exports = { getCache, setCache, DEFAULT_TTL_MS };

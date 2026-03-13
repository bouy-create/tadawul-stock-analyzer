const store = new Map();
const DEFAULT_TTL_MS = 60 * 1000;
const MAX_ENTRIES = 300;

const stats = {
  hits: 0,
  misses: 0,
  expirations: 0,
  sets: 0,
  deletes: 0
};

function getCache(key) {
  const entry = store.get(key);
  if (!entry) {
    stats.misses += 1;
    return null;
  }

  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    stats.expirations += 1;
    stats.misses += 1;
    return null;
  }

  stats.hits += 1;
  return entry.value;
}

function setCache(key, value, ttlMs = DEFAULT_TTL_MS) {
  if (store.size >= MAX_ENTRIES) {
    const oldestKey = store.keys().next().value;
    if (oldestKey) {
      store.delete(oldestKey);
      stats.deletes += 1;
    }
  }

  store.set(key, {
    value,
    expiresAt: Date.now() + ttlMs
  });
  stats.sets += 1;
}

function deleteCache(key) {
  const removed = store.delete(key);
  if (removed) stats.deletes += 1;
  return removed;
}

function cacheStats() {
  return {
    ...stats,
    size: store.size,
    keys: [...store.keys()]
  };
}

module.exports = {
  getCache,
  setCache,
  deleteCache,
  cacheStats,
  DEFAULT_TTL_MS
};

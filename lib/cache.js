const store = new Map();
const MAX = 300;
const TTL = 60 * 1000;

function getCache(key) {
  const item = store.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    store.delete(key);
    return null;
  }
  store.delete(key);
  store.set(key, item);
  return item.value;
}

function setCache(key, value) {
  if (store.size >= MAX) {
    const oldest = store.keys().next().value;
    store.delete(oldest);
  }
  store.set(key, { value, expiresAt: Date.now() + TTL });
}

module.exports = { getCache, setCache };

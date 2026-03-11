const { tickerMap } = require("../lib/tickerMap");

function normalizeSymbol(raw) {
  if (!raw || typeof raw !== "string") return null;
  const cleaned = raw.trim().toUpperCase();
  if (!cleaned) return null;
  if (tickerMap[cleaned]) return tickerMap[cleaned];
  if (/^[0-9]{4}$/.test(cleaned)) return `${cleaned}.SR`;
  if (/^[0-9]{4}\.SR$/.test(cleaned)) return cleaned;
  return cleaned;
}

module.exports = { normalizeSymbol };

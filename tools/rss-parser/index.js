class Parser {
  async parseURL(url) {
    const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) throw new Error(`RSS request failed with status ${response.status}`);
    const xml = await response.text();
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    const items = [];

    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
      const raw = match[1];
      const title = (raw.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || raw.match(/<title>(.*?)<\/title>/)?.[1] || "").trim();
      const link = (raw.match(/<link>(.*?)<\/link>/)?.[1] || "").trim();
      const pubDate = (raw.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || "").trim();
      const source = (raw.match(/<source[^>]*>(.*?)<\/source>/)?.[1] || "").trim();
      items.push({ title, link, pubDate, source, isoDate: pubDate ? new Date(pubDate).toISOString() : null });
    }

    return { items };
  }
}

module.exports = Parser;
module.exports.default = Parser;

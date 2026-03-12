class Parser {
  async parseURL(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.status}`);
    }

    const xml = await response.text();
    return parseRSS(xml, url);
  }
}

function decodeEntities(value) {
  if (!value) return '';
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function getTagValue(block, tagName) {
  const pattern = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = block.match(pattern);
  return match ? decodeEntities(match[1]) : null;
}

function parseRSS(xml, fallbackTitle) {
  const items = [];
  const channelTitle = getTagValue(xml, 'title') || fallbackTitle;
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];

  for (const itemXML of itemMatches) {
    const title = getTagValue(itemXML, 'title');
    const link = getTagValue(itemXML, 'link');
    const pubDate = getTagValue(itemXML, 'pubDate');
    const guid = getTagValue(itemXML, 'guid');
    const creator = getTagValue(itemXML, 'dc:creator') || getTagValue(itemXML, 'author');
    const contentSnippet = getTagValue(itemXML, 'description');

    items.push({
      title,
      link,
      pubDate,
      isoDate: toISO(pubDate),
      guid,
      creator,
      contentSnippet
    });
  }

  return { title: channelTitle, items };
}

module.exports = Parser;

function toISO(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

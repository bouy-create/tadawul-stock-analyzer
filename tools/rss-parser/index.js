class Parser {
  async parseURL(url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch RSS feed: ${response.status}`);
    }

    const xml = await response.text();
    return parseFeed(xml, url);
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

function getAtomLink(block) {
  const match = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>(?:<\/link>)?/i);
  return match ? decodeEntities(match[1]) : null;
}

function toISO(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseRSSItems(xml) {
  const itemMatches = xml.match(/<item[\s\S]*?<\/item>/gi) || [];
  return itemMatches.map((itemXML) => {
    const pubDate = getTagValue(itemXML, 'pubDate');
    return {
      title: getTagValue(itemXML, 'title'),
      link: getTagValue(itemXML, 'link'),
      pubDate,
      isoDate: toISO(pubDate),
      guid: getTagValue(itemXML, 'guid'),
      creator: getTagValue(itemXML, 'dc:creator') || getTagValue(itemXML, 'author'),
      contentSnippet: getTagValue(itemXML, 'description')
    };
  });
}

function parseAtomItems(xml) {
  const entryMatches = xml.match(/<entry[\s\S]*?<\/entry>/gi) || [];
  return entryMatches.map((entryXML) => {
    const published = getTagValue(entryXML, 'updated') || getTagValue(entryXML, 'published');
    return {
      title: getTagValue(entryXML, 'title'),
      link: getAtomLink(entryXML),
      pubDate: published,
      isoDate: toISO(published),
      guid: getTagValue(entryXML, 'id'),
      creator: getTagValue(entryXML, 'author') || getTagValue(entryXML, 'name'),
      contentSnippet: getTagValue(entryXML, 'summary') || getTagValue(entryXML, 'content')
    };
  });
}

function parseFeed(xml, fallbackTitle) {
  const channelTitle = getTagValue(xml, 'title') || fallbackTitle;
  const looksAtom = /<feed[\s>]/i.test(xml) || /<entry[\s>]/i.test(xml);
  const items = looksAtom ? parseAtomItems(xml) : parseRSSItems(xml);
  return { title: channelTitle, items };
}

module.exports = Parser;

function parseDictionary(text) {
  const index = new Map();
  let maxLength = 1;
  let count = 0;
  const records = Array.isArray(text) ? text : text.split(/\r?\n/);
  for (const line of records) {
    let entry;
    if (typeof line === 'object' && line) {
      entry = { traditional: line.traditional, simplified: line.simplified, pinyin: line.pinyin, definitions: line.english };
    } else {
    const match = line.match(/^(\S+) (\S+) \[([^\]]+)\] \/(.+)\/$/);
    if (!match) continue;
      entry = { traditional: match[1], simplified: match[2], pinyin: match[3], definitions: match[4].split('/') };
    }
    count++;
    for (const word of new Set([entry.traditional, entry.simplified])) {
      maxLength = Math.max(maxLength, word.length);
      if (!index.has(word)) index.set(word, []);
      index.get(word).push(entry);
    }
  }
  return { index, maxLength, count };
}
function lookup(dictionary, text) {
  if (typeof text !== 'string' || text.length > 10000) throw new Error('Enter at most 10,000 characters.');
  const tokens = [];
  for (let offset = 0; offset < text.length;) {
    let found;
    for (let size = Math.min(dictionary.maxLength, text.length - offset); size > 0; size--) {
      const word = text.slice(offset, offset + size);
      const entries = dictionary.index.get(word);
      if (entries) { found = { word, entries }; break; }
    }
    if (found) { tokens.push(found); offset += found.word.length; }
    else {
      const char = String.fromCodePoint(text.codePointAt(offset));
      const last = tokens.at(-1);
      if (last && !last.entries.length) last.word += char;
      else tokens.push({ word: char, entries: [] });
      offset += char.length;
    }
  }
  return tokens;
}
module.exports = { parseDictionary, lookup };

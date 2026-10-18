const OpenCC = require('opencc-js');
const simplify = OpenCC.Converter({ from: 't', to: 'cn' });
function translationChunks(text, limit = 160) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('No text to translate.');
  if ([...text].length > 2000) throw new Error('Offline translation supports up to 2,000 characters. Select a shorter passage.');
  const chunks = [];
  const lines = text.trim().replace(/\r\n?/g, '\n').split(/(\n+)/);
  for (const line of lines) {
    if (/^\n+$/.test(line)) { if (chunks.length) chunks.at(-1).separator = '\n'; continue; }
    const sentences = [];
    let start = 0;
    // A decimal point is part of its number, not a sentence boundary.
    for (const boundary of line.matchAll(/[。！？!?]+|\.(?!\d)/gu)) {
      const end = boundary.index + boundary[0].length;
      sentences.push(line.slice(start, end)); start = end;
    }
    if (start < line.length) sentences.push(line.slice(start));
    for (const sentence of sentences) {
      let remaining = [...sentence.trim()];
      while (remaining.length) {
        let count = Math.min(limit, remaining.length);
        if (count < remaining.length) for (let i = count - 1; i >= Math.floor(limit * .65); i--) if (/[\s，,；;]/u.test(remaining[i])) { count = i + 1; break; }
        const part = remaining.splice(0, count).join('').trim();
        if (part) chunks.push({ text: simplify(part), separator: ' ' });
      }
    }
  }
  return chunks;
}
module.exports = { translationChunks };

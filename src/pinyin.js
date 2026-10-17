(function (root) {
  function tone(syllable) { return Number(syllable.match(/[1-5]$/)?.[0] || 5); }
  function mark(syllable) {
    const value = tone(syllable);
    const base = syllable.replace(/[1-5]$/, '').replace(/u:|v/g, 'ü').replace(/U:|V/g, 'Ü');
    if (value === 5) return base;
    let position = base.search(/[aA]/);
    if (position < 0) position = base.search(/[eE]/);
    if (position < 0 && /ou/i.test(base)) position = base.search(/[oO]/);
    if (position < 0) {
      for (let i = base.length - 1; i >= 0; i--) if (/[aeiouü]/i.test(base[i])) { position = i; break; }
    }
    if (position < 0) return base;
    const accented = { a: 'āáǎà', e: 'ēéěè', i: 'īíǐì', o: 'ōóǒò', u: 'ūúǔù', ü: 'ǖǘǚǜ' };
    const letter = base[position];
    let replacement = accented[letter.toLowerCase()][value - 1];
    if (letter !== letter.toLowerCase()) replacement = replacement.toUpperCase();
    return base.slice(0, position) + replacement + base.slice(position + 1);
  }
  const api = { tone, mark };
  if (typeof module !== 'undefined') module.exports = api;
  else root.pinyin = api;
})(globalThis);

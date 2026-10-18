function isDictionaryLookup(tokens) {
  // A known lexical entry plus surrounding punctuation is a word lookup.
  // Extra text, unknown Han characters or Latin text still needs passage handling.
  return tokens.filter(token => token.entries.length).length === 1 &&
    tokens.every(token => token.entries.length || /^[\p{P}\p{Z}\s]*$/u.test(token.word));
}
module.exports = { isDictionaryLookup };

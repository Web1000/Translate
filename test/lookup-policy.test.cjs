const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseDictionary, lookup } = require('../src/dictionary.cjs');
const { isDictionaryLookup } = require('../src/lookup-policy.cjs');
const dictionary = parseDictionary(require('cedict-json'));
test('recognized words in either script use dictionary even with surrounding punctuation', () => {
  for (const text of ['交际', '交際', '「交际」！', '社交', '銀行', '银行', '学习', '  交际。\n']) {
    assert.equal(isDictionaryLookup(lookup(dictionary, text)), true, text);
  }
});
test('sentences, mixed text and unknown words are not reduced to one recognized fragment', () => {
  for (const text of ['他很擅长交际。', '我喜欢学习中文。', 'APP 交际', '交际𠀀', '未知𠀀', '', 'APP', '交际 交际']) {
    assert.equal(isDictionaryLookup(lookup(dictionary, text)), false, text);
  }
});

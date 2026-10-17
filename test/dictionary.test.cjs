const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseDictionary, lookup } = require('../src/dictionary.cjs');
const { mark, tone } = require('../src/pinyin.js');
const fixture = '# comment\n學習 学习 [xue2 xi2] /to learn/to study/\n學 学 [xue2] /to learn/\n你好 你好 [ni3 hao3] /hello/\n行 行 [xing2] /to walk/\n行 行 [hang2] /row/profession/';
test('longest match supports simplified and traditional without losing punctuation', () => {
  const dictionary = parseDictionary(fixture);
  for (const text of ['学习', '學習']) {
    const tokens = lookup(dictionary, `你好，${text}！`);
    assert.deepEqual(tokens.map(token => token.word), ['你好', '，', text, '！']);
    assert.equal(tokens[2].entries[0].definitions[1], 'to study');
    assert.equal(tokens.map(token => token.word).join(''), `你好，${text}！`);
  }
});
test('polyphonic entries preserved, identical character forms not duplicated', () => {
  assert.equal(lookup(parseDictionary(fixture), '行')[0].entries.length, 2);
});
test('English letter entries are not looked up or split inside English words', () => {
  const dictionary = parseDictionary(`${fixture}\nA A [A] /to steal/\nP P [P] /to photoshop/`);
  const tokens = lookup(dictionary, '学习 APP + A P');
  assert.equal(tokens.filter(token => token.entries.length).length, 1);
  assert.equal(tokens.map(token => token.word).join(''), '学习 APP + A P');
});
test('duplicate entries merge glosses without dropping other pronunciations', () => {
  const dictionary = parseDictionary(`${fixture}\n行 行 [xing2] /to walk/to go/`);
  const entries = lookup(dictionary, '行')[0].entries;
  assert.equal(entries.length, 2);
  assert.deepEqual(entries.find(entry => entry.pinyin === 'xing2').definitions, ['to walk', 'to go']);
  assert.ok(entries.some(entry => entry.pinyin === 'hang2'));
});
test('screenshot example defaults to ordinary readings and retains surname alternatives', () => {
  const dictionary = parseDictionary(require('cedict-json'));
  for (const text of ['北美生活必看！超全店铺 APP 盘点', '北美生活必看！超全店鋪 APP 盤點']) {
    const tokens = lookup(dictionary, text);
    assert.equal(tokens.find(token => token.word === '看').entries[0].pinyin, 'kan4');
    const all = tokens.find(token => token.word === '全');
    assert.equal(all.entries[0].pinyin, 'quan2');
    assert.ok(all.entries[0].definitions.includes('all'));
    assert.ok(all.entries.some(entry => entry.definitions.includes('surname Quan')));
    assert.equal(tokens.some(token => /^[A-Z]+$/.test(token.word) && token.entries.length), false);
    assert.equal(tokens.map(token => token.word).join(''), text);
  }
});
test('unknown supplementary Unicode characters survive segmentation', () => {
  const text = '🙂𠀀abc';
  assert.deepEqual(lookup(parseDictionary(fixture), text), [{ word: text, entries: [] }]);
});
test('input limits and malformed input rejected', () => {
  const dictionary = parseDictionary(fixture);
  assert.throws(() => lookup(dictionary, null));
  assert.throws(() => lookup(dictionary, '中'.repeat(10001)));
});
test('real bundled dictionary covers both scripts and common phrases', () => {
  const dictionary = parseDictionary(require('cedict-json'));
  assert.ok(dictionary.count > 100000);
  for (const text of ['中文', '学习', '學習', '你好', '電腦', '电脑']) {
    const tokens = lookup(dictionary, text);
    assert.equal(tokens.length, 1);
    assert.ok(tokens[0].entries.length > 0, text);
  }
});
test('numbered pinyin converts to tone marks and correct tone classes', () => {
  for (const [input, expected] of [['ni3', 'nǐ'], ['hao3', 'hǎo'], ['xue2', 'xué'], ['gui4', 'guì'], ['liu2', 'liú'], ['dou1', 'dōu'], ['lu:4', 'lǜ'], ['Nv3', 'Nǚ'], ['ma5', 'ma'], ['ABC', 'ABC']]) assert.equal(mark(input), expected);
  assert.equal(tone('ni3'), 3); assert.equal(tone('de5'), 5);
});

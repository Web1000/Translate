const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readSelection } = require('../src/selection.cjs');
const scriptPath = path.resolve(__dirname, '../src/copy-selection.ps1');
class FixtureItem {
  constructor(data) { this.data = data; this.types = Object.keys(data); }
  async getType(type) { return typeof this.data[type] === 'string' ? new Blob([this.data[type]]) : this.data[type]; }
}
function fixture() {
  let items = [new FixtureItem({ 'text/plain': 'previous clipboard', 'text/html': '<b>previous clipboard</b>' })];
  const writes = [];
  return {
    ClipboardItem: FixtureItem,
    clipboard: {
      read: async () => items,
      readText: async () => { const item = items.find(item => item.types.includes('text/plain')); return item ? (await item.getType('text/plain')).text() : ''; },
      write: async data => { assert.ok(Array.isArray(data)); writes.push(data); items = data; },
      clear: () => { items = []; }
    },
    writes, setText: value => { items = [new FixtureItem({ 'text/plain': value })]; }, setEmpty: () => { items = [new FixtureItem({})]; }
  };
}
test('accessibility selection preserves Unicode without touching the clipboard', async () => {
  const f = fixture();
  const text = await readSelection({ ...f, scriptPath, platform: 'win32', execute: async (file, args, options) => {
    assert.equal(file, 'powershell.exe'); assert.ok(args.includes('-EncodedCommand'));
    assert.match(Buffer.from(args.at(-1), 'base64').toString('utf16le'), /GetForegroundWindow/);
    assert.equal(options.windowsHide, true);
    return { stdout: JSON.stringify({ text: '學習中文', usedClipboard: false }) };
  } });
  assert.equal(text, '學習中文'); assert.equal(f.writes.length, 0);
});
test('async copy fallback restores text and HTML using ClipboardItem payloads', async () => {
  const f = fixture();
  const text = await readSelection({ ...f, scriptPath, platform: 'win32', execute: async () => { f.setText('你好'); return { stdout: JSON.stringify({ text: '你好', usedClipboard: true }) }; } });
  assert.equal(text, '你好'); assert.equal(await f.clipboard.readText(), 'previous clipboard');
  assert.equal(await (await f.writes[0][0].getType('text/html')).text(), '<b>previous clipboard</b>');
});
test('an initially empty clipboard is restored to empty', async () => {
  const f = fixture(); f.setEmpty();
  await readSelection({ ...f, scriptPath, platform: 'win32', execute: async () => { f.setText('你好'); return { stdout: JSON.stringify({ text: '你好', usedClipboard: true }) }; } });
  assert.deepEqual(await f.clipboard.read(), []);
});
test('a newer user clipboard change is never overwritten', async () => {
  const f = fixture();
  await readSelection({ ...f, scriptPath, platform: 'win32', execute: async () => { f.setText('new user copy'); return { stdout: JSON.stringify({ text: '你好', usedClipboard: true }) }; } });
  assert.equal(f.writes.length, 0);
});
test('empty selection and failed helpers produce useful errors, not stale clipboard results', async () => {
  const f = fixture();
  await assert.rejects(readSelection({ ...f, scriptPath, platform: 'win32', execute: async () => ({ stdout: '{"text":"","usedClipboard":false}' }) }), /No selected text/);
  await assert.rejects(readSelection({ ...f, scriptPath, platform: 'win32', execute: async () => { throw new Error('failure'); } }), /Windows could not read/);
  await assert.rejects(readSelection({ ...f, scriptPath, platform: 'win32', execute: async () => ({ stdout: '{"error":"Release the shortcut keys."}' }) }), /Release the shortcut/);
});

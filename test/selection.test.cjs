const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { readSelection } = require('../src/selection.cjs');
const scriptPath = path.resolve(__dirname, '../src/copy-selection.ps1');
function fixture() {
  let text = 'previous clipboard';
  const writes = [];
  return {
    clipboard: { readText: () => text, readHTML: () => '<b>previous clipboard</b>', readRTF: () => '', readImage: () => ({ isEmpty: () => true }), write: data => { writes.push(data); text = data.text; } },
    writes, setText: value => { text = value; }
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
test('copy fallback restores the previous standard clipboard formats', async () => {
  const f = fixture();
  const text = await readSelection({ ...f, scriptPath, platform: 'win32', execute: async () => { f.setText('你好'); return { stdout: JSON.stringify({ text: '你好', usedClipboard: true }) }; } });
  assert.equal(text, '你好'); assert.equal(f.clipboard.readText(), 'previous clipboard');
  assert.equal(f.writes[0].html, '<b>previous clipboard</b>');
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

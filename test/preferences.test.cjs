const { test } = require('node:test');
const assert = require('node:assert/strict');
const { defaults, validatePreferences, normalizeShortcut, registerShortcuts } = require('../src/preferences.cjs');
test('shortcuts normalize aliases and reject duplicates and invalid combinations', () => {
  assert.equal(normalizeShortcut('Ctrl + Alt + x'), 'Control+Alt+X');
  assert.equal(normalizeShortcut('Win+Shift+F12'), 'Shift+Super+F12');
  for (const shortcut of ['Shift+D', 'D', 'Ctrl+Ctrl+D', 'Ctrl+Escape', 'Ctrl+']) assert.throws(() => normalizeShortcut(shortcut));
  assert.throws(() => validatePreferences({ ...defaults, captureShortcut: 'Ctrl+Shift+D' }), /different/);
  assert.throws(() => validatePreferences({ selectionEnabled: 'false' }), /Invalid/);
  assert.throws(() => validatePreferences({ extra: true }), /Unknown/);
});
test('disabled features do not register hotkeys, conflicts are reported', () => {
  let calls = [];
  const api = { unregisterAll: () => calls.push('clear'), register: key => { calls.push(key); return key !== defaults.captureShortcut; } };
  const errors = registerShortcuts(api, { ...defaults, selectionEnabled: false }, { selection() {}, capture() {} });
  assert.deepEqual(calls, ['clear', defaults.captureShortcut]);
  assert.deepEqual(errors, [defaults.captureShortcut]);
});

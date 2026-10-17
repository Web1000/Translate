const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
for (const method of ['automatic', 'clipboard']) {
  test(`Windows selection helper: ${method} path with a real selected text control`, { skip: process.platform !== 'win32', timeout: 25000 }, async () => {
    const code = fs.readFileSync(path.resolve(__dirname, '../scripts/windows-selection-fixture.ps1'), 'utf8');
    const { stdout } = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', Buffer.from(code, 'utf16le').toString('base64')], {
      windowsHide: true, timeout: 22000, encoding: 'utf8', maxBuffer: 1024 * 1024,
      env: { ...process.env, HANZI_SELECTION_HELPER: path.resolve(__dirname, '../src/copy-selection.ps1'), HANZI_SELECTION_METHOD: method }
    });
    const result = JSON.parse(stdout.trim().replace(/^\uFEFF/, ''));
    assert.equal(result.error, null); assert.equal(result.text, '學習中文');
    if (method === 'clipboard') assert.equal(result.usedClipboard, true);
  });
}

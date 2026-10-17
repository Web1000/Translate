const fs = require('node:fs');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
async function readSelection({ clipboard, scriptPath, platform = process.platform, execute = run }) {
  if (platform !== 'win32') throw new Error('Selected-text lookup is available on Windows. Use screen capture on this platform.');
  const previous = { text: clipboard.readText(), html: clipboard.readHTML(), rtf: clipboard.readRTF(), image: clipboard.readImage() };
  if (previous.image.isEmpty()) delete previous.image;
  // Avoid PowerShell quoting changes in Windows argument parsing.
  const command = Buffer.from(fs.readFileSync(scriptPath, 'utf8'), 'utf16le').toString('base64');
  let response;
  try {
    response = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', command], {
      windowsHide: true, timeout: 12000, maxBuffer: 1024 * 1024, encoding: 'utf8'
    });
  } catch {
    throw new Error('Windows could not read the selection. Try selecting text in Notepad, then release the shortcut keys. For an app that blocks copying, use screen capture.');
  }
  let result;
  try { result = JSON.parse(response.stdout.replace(/^\uFEFF/, '').trim()); }
  catch { throw new Error('Windows returned an unreadable selection. Try again, or use screen capture.'); }
  if (result.usedClipboard && typeof result.text === 'string' && result.text && clipboard.readText() === result.text) clipboard.write(previous);
  if (result.error) throw new Error(result.error);
  if (typeof result.text !== 'string' || !result.text.trim()) throw new Error('No selected text found. Highlight Chinese text in another app, then press the shortcut. Use screen capture for images or text that cannot be copied.');
  return result.text.slice(0, 10000);
}
module.exports = { readSelection };

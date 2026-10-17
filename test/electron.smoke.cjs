const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { _electron: electron } = require('playwright');
test('shortcuts produce only a compact popup; settings, capture, errors and persistence work', { timeout: 90000 }, async () => {
  const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'hanzi-lens-test-'));
  const args = [`--user-data-dir=${userData}`, ...(process.env.ELECTRON_APP_PATH ? [] : [path.resolve(__dirname, '..')])];
  if (process.env.ELECTRON_TEST_NO_SANDBOX === '1') args.unshift('--no-sandbox');
  if (process.env.ELECTRON_TEST_HEADLESS === '1') args.unshift('--ozone-platform=headless');
  const launch = () => electron.launch({ args, ...(process.env.ELECTRON_APP_PATH ? { executablePath: process.env.ELECTRON_APP_PATH } : {}), timeout: 20000 });
  let application = await launch();
  try {
    const page = await application.firstWindow();
    await page.waitForLoadState('domcontentloaded');
    const settings = await page.evaluate(() => window.hanzi.settings());
    assert.ok(settings.dictionaryEntries > 100000);
    assert.equal(await page.locator('textarea').count(), 0);
    await application.evaluate(async ({ app, globalShortcut, screen, BrowserWindow, clipboard, ClipboardItem }) => {
      const require = process.getBuiltinModule('node:module').createRequire(`${app.getAppPath()}/package.json`);
      // Use the real Electron clipboard; substitute only the Windows helper process.
      globalThis.selectionClipboardBackup = await Promise.all((await clipboard.read()).filter(item => item.types.length).map(async item => new ClipboardItem(Object.fromEntries(await Promise.all(item.types.map(async type => [type, await item.getType(type)]))))));
      await clipboard.write([new ClipboardItem({ 'text/plain': 'previous clipboard', 'text/html': '<b>previous clipboard</b>' })]);
      globalThis.callbacks = new Map();
      globalShortcut.unregisterAll();
      globalShortcut.unregisterAll = () => globalThis.callbacks.clear();
      globalShortcut.register = (key, handler) => { if (key === 'Control+Alt+X') return false; globalThis.callbacks.set(key, handler); return true; };
      const display = screen.getPrimaryDisplay();
      screen.getDisplayNearestPoint = () => ({ ...display, bounds: { x: 0, y: 0, width: 800, height: 600 }, workArea: { x: 0, y: 0, width: 800, height: 600 }, size: { width: 800, height: 600 }, scaleFactor: 1 });
      const selection = require(`${app.getAppPath()}/src/selection.cjs`);
      const realReadSelection = selection.readSelection;
      selection.readSelection = async options => {
        if (BrowserWindow.getAllWindows().some(window => window.isVisible())) throw new Error('A Hanzi Lens window stole the source selection focus.');
        return realReadSelection({ ...options, platform: 'win32', execute: async () => {
          await clipboard.writeText('學習中文');
          return { stdout: JSON.stringify({ text: '學習中文', usedClipboard: true }) };
        } });
      };
      require(`${app.getAppPath()}/src/main.cjs`).savePreferences({ selectionEnabled: true, captureEnabled: true });
      BrowserWindow.getAllWindows()[0].hide();
    });
    const opened = application.waitForEvent('window');
    await application.evaluate(async () => { await globalThis.callbacks.get('Control+Shift+D')(); });
    const popup = await opened;
    await popup.waitForFunction(() => document.getElementById('definitions')?.textContent.includes('to learn'));
    assert.match(await popup.locator('#characters').innerText(), /學/);
    const restoredClipboard = await application.evaluate(async ({ clipboard }) => {
      const item = (await clipboard.read()).find(item => item.types.includes('text/html'));
      return { text: await clipboard.readText(), html: item ? await (await item.getType('text/html')).text() : '' };
    });
    assert.equal(restoredClipboard.text, 'previous clipboard');
    assert.match(restoredClipboard.html, /<b>previous clipboard<\/b>/);
    await application.evaluate(async ({ clipboard }) => {
      if (globalThis.selectionClipboardBackup.length) await clipboard.write(globalThis.selectionClipboardBackup);
      else clipboard.clear();
      delete globalThis.selectionClipboardBackup;
    });
    assert.equal(await popup.locator('textarea').count(), 0);
    const windows = await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().map(window => ({ title: window.getTitle(), visible: window.isVisible(), width: window.getBounds().width })));
    assert.equal(windows.find(window => window.title.includes('Settings')).visible, false);
    assert.ok(windows.find(window => window.title.includes('Lookup')).width <= 520);
    await page.evaluate(() => window.hanzi.saveSettings({ chineseStyle: 'simplified', showPinyin: false }));
    await popup.waitForFunction(() => document.body.classList.contains('no-pinyin'));
    assert.match(await popup.locator('#characters').innerText(), /学/);
    // A conflict leaves the previous binding in use and the saved file untouched.
    await assert.rejects(page.evaluate(() => window.hanzi.saveSettings({ selectionShortcut: 'Control+Alt+X' })), /Shortcut unavailable/);
    assert.equal((await page.evaluate(() => window.hanzi.settings())).selectionShortcut, 'Control+Shift+D');
    assert.equal(await application.evaluate(() => globalThis.callbacks.has('Control+Shift+D')), true);
    // Failed selection stays in the popup rather than opening Settings.
    await application.evaluate(async ({ app }) => {
      const require = process.getBuiltinModule('node:module').createRequire(`${app.getAppPath()}/package.json`);
      require(`${app.getAppPath()}/src/selection.cjs`).readSelection = async () => { throw new Error('No selected text found.'); };
      await globalThis.callbacks.get('Control+Shift+D')();
    });
    await popup.waitForFunction(() => document.getElementById('message').textContent.includes('No selected text'));
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.getTitle().includes('Settings')).isVisible()), false);
    const image = await page.evaluate(() => {
      const canvas = document.createElement('canvas'); canvas.width = 700; canvas.height = 130;
      const context = canvas.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0, 0, 700, 130);
      context.fillStyle = 'black'; context.font = '60px sans-serif'; context.fillText('你好世界 學習中文', 20, 90);
      return canvas.toDataURL();
    });
    await application.evaluate(({ desktopCapturer, nativeImage, screen }, image) => {
      desktopCapturer.getSources = async () => [{ display_id: String(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id), thumbnail: nativeImage.createFromDataURL(image) }];
    }, image);
    const captureOpened = application.waitForEvent('window');
    await application.evaluate(async () => { await globalThis.callbacks.get('Control+Shift+S')(); });
    const overlay = await captureOpened;
    await overlay.waitForFunction(() => document.getElementById('capture')?.width === 700);
    await overlay.setViewportSize({ width: 800, height: 600 });
    await overlay.mouse.move(2, 2); await overlay.mouse.down(); await overlay.mouse.move(798, 598); await overlay.mouse.up();
    await popup.waitForFunction(() => document.getElementById('definitions').textContent.includes('hello'), null, { timeout: 30000 });
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.getTitle().includes('Settings')).isVisible()), false);
    const cancelOpened = application.waitForEvent('window');
    await application.evaluate(async () => { await globalThis.callbacks.get('Control+Shift+S')(); });
    const canceled = await cancelOpened;
    await canceled.waitForLoadState('domcontentloaded');
    const closed = canceled.waitForEvent('close');
    await canceled.keyboard.down('Escape');
    await closed;
    await page.keyboard.up('Escape');
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().filter(window => window.isVisible()).length), 0);
    await page.evaluate(() => window.hanzi.saveSettings({ selectionEnabled: false, captureEnabled: false, selectionShortcut: 'Control+Alt+L', fontSize: 'large' }));
    assert.equal(await application.evaluate(() => globalThis.callbacks.size), 0);
    await application.close(); application = await launch();
    const restarted = await application.firstWindow(); await restarted.waitForLoadState('domcontentloaded');
    const persisted = await restarted.evaluate(() => window.hanzi.settings());
    assert.equal(persisted.selectionEnabled, false); assert.equal(persisted.captureEnabled, false);
    assert.equal(persisted.selectionShortcut, 'Control+Alt+L'); assert.equal(persisted.fontSize, 'large');
    // Settings closes to the background, leaving the process available via its tray.
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isVisible()), false);
  } finally {
    try {
      await application.evaluate(async ({ clipboard }) => {
        if (!globalThis.selectionClipboardBackup) return;
        if (globalThis.selectionClipboardBackup.length) await clipboard.write(globalThis.selectionClipboardBackup);
        else clipboard.clear();
      });
    } finally { await application.close(); fs.rmSync(userData, { recursive: true, force: true }); }
  }
});

const { app, BrowserWindow, clipboard, ClipboardItem, desktopCapturer, globalShortcut, ipcMain, screen, safeStorage, Tray, Menu, nativeImage, nativeTheme } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createOcrWorker } = require('./ocr.cjs');
const { parseDictionary, lookup } = require('./dictionary.cjs');
const { translate } = require('./translation.cjs');
const { ModelPack } = require('./model-pack.cjs');
const { LocalTranslator } = require('./local-translator.cjs');
const { utilityWorker } = require('./utility-worker.cjs');
const selection = require('./selection.cjs');
const { defaults, validatePreferences, registerShortcuts } = require('./preferences.cjs');
let main, popup, overlay, tray, workerPromise, dictionary, preferences = { ...defaults };
let captureBusy = false, ocrBusy = false, selectionBusy = false, quitting = false, recording = false;
let shortcutErrors = [], preferencesWarning = '', revision = 0;
let result = { id: 0, status: 'idle', text: '', tokens: [], source: 'selection', translation: '' };
let localPack, localTranslator, translationRequest = 0;
const dataRoot = () => app.isPackaged ? path.join(process.resourcesPath, 'data') : path.join(__dirname, '..', 'resources');
const keyPath = () => path.join(app.getPath('userData'), 'translation-key');
const preferencesPath = () => path.join(app.getPath('userData'), 'preferences.json');
const alive = window => window && !window.isDestroyed();
function key() { try { return safeStorage.decryptString(fs.readFileSync(keyPath())); } catch { return ''; } }
function offlineState() { return localTranslator?.snapshot() || { phase: 'checking', installed: false, enabled: false, engine: 'idle' }; }
function resultSnapshot() { return { ...result, preferences, hasKey: Boolean(key()), localTranslation: offlineState() }; }
function snapshot() { return { ...preferences, hasKey: Boolean(key()), dictionaryEntries: dictionary?.count || 0, shortcutErrors, warning: preferencesWarning, version: app.getVersion(), localTranslation: offlineState() }; }
function sendResult() { if (alive(popup)) popup.webContents.send('result', resultSnapshot()); }
function sendSettings() {
  if (alive(main)) main.webContents.send('settings-changed', snapshot());
  sendResult();
}
function showSettings() { if (alive(main)) { main.show(); main.focus(); } }
function options(extra = {}) {
  return { webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }, backgroundColor: '#242424', icon: path.join(__dirname, 'tray.png'), ...extra };
}
function protect(window) {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', event => event.preventDefault());
}
function trust(event, windows) {
  if (!windows.some(window => alive(window) && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame)) throw new Error('Unsupported request.');
}
function popupBounds(anchor, height) {
  const area = screen.getDisplayNearestPoint(anchor).workArea;
  const width = Math.min(520, Math.max(360, area.width));
  return { width, height, x: Math.round(Math.max(area.x, Math.min(anchor.x + 16, area.x + area.width - width))), y: Math.round(Math.max(area.y, Math.min(anchor.y + 20, area.y + area.height - height))) };
}
async function showResult(next, anchor = screen.getCursorScreenPoint()) {
  translationRequest++; localTranslator?.cancel();
  result = { id: ++revision, text: '', tokens: [], translation: '', ...next };
  const height = next.status === 'ready' ? Math.min(570, Math.max(240, 155 + next.tokens.filter(token => token.entries.length).length * 55)) : 205;
  if (!alive(popup)) {
    popup = new BrowserWindow(options({ ...popupBounds(anchor, height), title: 'Hanzi Lens — Lookup', frame: false, show: false, minWidth: 360, minHeight: 180, alwaysOnTop: true, skipTaskbar: true, resizable: true }));
    protect(popup);
    popup.on('close', event => { if (!quitting) { event.preventDefault(); popup.hide(); } });
    popup.webContents.on('before-input-event', (event, input) => { if (input.key === 'Escape') { event.preventDefault(); popup.hide(); } });
    await popup.loadFile(path.join(__dirname, 'popup.html'));
  } else {
    popup.setBounds(popupBounds(anchor, height));
  }
  sendResult();
  popup.showInactive();
}
async function showText(text, source, anchor) {
  if (!dictionary) throw new Error('The dictionary is missing. Reinstall the app or run npm.cmd ci from the source folder.');
  await showResult({ status: 'ready', text, tokens: lookup(dictionary, text), source }, anchor);
  if (preferences.offlineTranslationEnabled && localPack.state.installed) startOfflineTranslation(result.id);
}
async function startOfflineTranslation(id) {
  if (id !== result.id || result.status !== 'ready') return;
  const request = ++translationRequest;
  result.translationStatus = 'loading'; result.translationSource = 'offline'; result.translationError = ''; sendResult();
  try {
    const output = await localTranslator.translate(result.text);
    if (id !== result.id || request !== translationRequest) return;
    result.translation = output.text; result.translationStatus = 'ready'; result.translationElapsedMs = output.elapsedMs; sendResult();
  } catch (error) {
    if (id !== result.id || request !== translationRequest) return;
    result.translationStatus = 'error'; result.translationError = error.message; sendResult();
  }
}
async function selectedText() {
  if (!preferences.selectionEnabled || selectionBusy || captureBusy || ocrBusy) return;
  selectionBusy = true;
  const anchor = screen.getCursorScreenPoint();
  try {
    // Do not open or focus any window until Windows has read the source selection.
    const scriptPath = app.isPackaged ? path.join(dataRoot(), 'copy-selection.ps1') : path.join(__dirname, 'copy-selection.ps1');
    const text = await selection.readSelection({ clipboard, ClipboardItem, scriptPath });
    await showText(text, 'selection', anchor);
  } catch (error) { await showResult({ status: 'error', source: 'selection', error: error.message }, anchor); }
  finally { selectionBusy = false; }
}
async function capture() {
  if (!preferences.captureEnabled) throw new Error('Screen capture is turned off in Settings.');
  if (captureBusy || ocrBusy || selectionBusy) throw new Error('Finish the current lookup first.');
  captureBusy = true;
  try {
    if (alive(main)) main.hide();
    if (alive(popup)) popup.hide();
    await new Promise(resolve => setTimeout(resolve, 220));
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: {
      width: Math.round(display.size.width * display.scaleFactor), height: Math.round(display.size.height * display.scaleFactor)
    }});
    const source = sources.find(item => item.display_id === String(display.id)) || (sources.length === 1 ? sources[0] : null);
    if (!source || source.thumbnail.isEmpty()) throw new Error('Could not capture this screen. Try another display or check screen recording permissions.');
    overlay = new BrowserWindow(options({ ...display.bounds, frame: false, movable: false, resizable: false, alwaysOnTop: true, skipTaskbar: true }));
    protect(overlay);
    overlay.on('closed', () => { overlay = null; captureBusy = false; });
    await overlay.loadFile(path.join(__dirname, 'capture.html'));
    overlay.webContents.send('capture-image', source.thumbnail.toDataURL());
    overlay.focus();
  } catch (error) { if (alive(overlay)) overlay.close(); captureBusy = false; throw error; }
}
async function captureAction() { try { await capture(); } catch (error) { await showResult({ status: 'error', source: 'capture', error: error.message }); } }
const handlers = { selection: selectedText, capture: captureAction };
function bind(preferencesToBind = preferences) { shortcutErrors = registerShortcuts(globalShortcut, preferencesToBind, handlers); return shortcutErrors; }
function resumeShortcuts() { if (recording) { recording = false; bind(); sendSettings(); } }
function updateTray() {
  if (!tray) return;
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Settings…', click: showSettings },
    { label: 'Capture passage', enabled: preferences.captureEnabled, click: captureAction },
    { type: 'separator' },
    { label: 'Text selection', type: 'checkbox', checked: preferences.selectionEnabled, click: item => { try { savePreferences({ selectionEnabled: item.checked }); } catch (error) { showResult({ status: 'error', source: 'selection', error: error.message }); } } },
    { label: 'Screen capture', type: 'checkbox', checked: preferences.captureEnabled, click: item => { try { savePreferences({ captureEnabled: item.checked }); } catch (error) { showResult({ status: 'error', source: 'capture', error: error.message }); } } },
    { type: 'separator' }, { label: 'Quit Hanzi Lens', click: () => app.quit() }
  ]));
}
function savePreferences(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid settings.');
  const next = validatePreferences({ ...preferences, ...patch });
  const previous = preferences;
  recording = false;
  const errors = bind(next);
  if (errors.length) { bind(previous); throw new Error(`Shortcut unavailable: ${errors.join(', ')}. Choose another combination. Your previous settings are still active.`); }
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    fs.writeFileSync(`${preferencesPath()}.tmp`, JSON.stringify(next, null, 2));
    fs.renameSync(`${preferencesPath()}.tmp`, preferencesPath());
  } catch { bind(previous); throw new Error('Could not save settings. Your previous settings are still active.'); }
  preferences = next; preferencesWarning = '';
  if (previous.offlineTranslationEnabled !== next.offlineTranslationEnabled) {
    translationRequest++; localTranslator.setEnabled(next.offlineTranslationEnabled);
    if (!next.offlineTranslationEnabled && result.translationSource === 'offline') { result.translationStatus = 'idle'; result.translation = ''; }
    if (next.offlineTranslationEnabled && result.status === 'ready' && localPack.state.installed) startOfflineTranslation(result.id);
  }
  updateTray(); sendSettings(); return snapshot();
}
function installIpc() {
  ipcMain.handle('settings', event => { trust(event, [main, popup]); return snapshot(); });
  ipcMain.handle('save-settings', (event, patch) => { trust(event, [main]); return savePreferences(patch); });
  ipcMain.handle('shortcut-recording', (event, enabled) => {
    trust(event, [main]);
    if (enabled === true && main.isFocused()) { recording = true; globalShortcut.unregisterAll(); }
    else resumeShortcuts();
  });
  ipcMain.handle('get-result', event => { trust(event, [popup]); return resultSnapshot(); });
  ipcMain.on('close-popup', event => { trust(event, [popup]); translationRequest++; localTranslator.cancel(); popup.hide(); });
  ipcMain.on('show-settings', event => { trust(event, [popup]); showSettings(); });
  ipcMain.handle('capture', async event => { trust(event, [main, popup]); await captureAction(); });
  ipcMain.on('cancel-capture', event => { trust(event, [overlay]); overlay.close(); });
  ipcMain.handle('recognize', async (event, image) => {
    trust(event, [overlay]);
    if (typeof image !== 'string' || !image.startsWith('data:image/png;base64,') || image.length > 40000000) throw new Error('Invalid capture.');
    if (ocrBusy) throw new Error('OCR is already running.');
    ocrBusy = true;
    const anchor = screen.getCursorScreenPoint();
    overlay.close();
    await showResult({ status: 'loading', source: 'capture' }, anchor);
    try {
      if (!workerPromise) workerPromise = createOcrWorker(dataRoot(), app.getPath('cache')).catch(error => { workerPromise = null; throw error; });
      const worker = await workerPromise;
      const recognized = await worker.recognize(Buffer.from(image.split(',')[1], 'base64'));
      const text = recognized.data.text.trim();
      if (!text) throw new Error('No text found. Capture a smaller area with larger, clearer Chinese text.');
      await showText(text.slice(0, 10000), 'capture', anchor);
    } catch (error) { await showResult({ status: 'error', source: 'capture', error: `OCR failed: ${error.message}` }, anchor); }
    finally { ocrBusy = false; }
  });
  ipcMain.handle('save-key', (event, value) => {
    trust(event, [main]);
    if (typeof value !== 'string' || value.length > 1000) throw new Error('Invalid API key.');
    if (!value.trim()) fs.rmSync(keyPath(), { force: true });
    else {
      if (!safeStorage.isEncryptionAvailable() || (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text')) throw new Error('Secure credential storage is unavailable.');
      fs.writeFileSync(keyPath(), safeStorage.encryptString(value.trim()), { mode: 0o600 });
    }
    sendSettings(); return snapshot();
  });
  ipcMain.handle('translate', async (event, id) => {
    trust(event, [popup]);
    if (id !== result.id || result.status !== 'ready') throw new Error('This lookup has changed. Try again.');
    const request = ++translationRequest; localTranslator.cancel();
    result.translationStatus = 'loading'; result.translationSource = 'online'; result.translationError = ''; sendResult();
    let output;
    try { output = await translate(result.text, key()); }
    catch (error) {
      if (id === result.id && request === translationRequest) { result.translationStatus = 'error'; result.translationError = error.message; sendResult(); }
      throw error;
    }
    if (id !== result.id || request !== translationRequest) return null;
    result.translation = output;
    result.translationSource = 'online'; result.translationStatus = 'ready'; result.translationError = ''; sendResult();
    return output;
  });
  ipcMain.handle('offline-translate', async (event, id) => {
    trust(event, [popup]); if (id !== result.id) throw new Error('This lookup has changed.');
    if (!preferences.offlineTranslationEnabled) throw new Error('Offline translation is turned off.');
    await localTranslator.setEnabled(true); return startOfflineTranslation(id);
  });
  ipcMain.handle('install-language-pack', async event => {
    trust(event, [main]);
    await localTranslator.setEnabled(false);
    await localPack.install();
    if (!preferences.offlineTranslationEnabled) savePreferences({ offlineTranslationEnabled: true });
    else await localTranslator.setEnabled(true);
    sendSettings(); return snapshot();
  });
  ipcMain.handle('cancel-language-pack', event => { trust(event, [main]); localPack.cancel(); });
  ipcMain.handle('remove-language-pack', async event => {
    trust(event, [main]);
    if (localPack.installing) throw new Error('Cancel the download before removing the pack.');
    if (preferences.offlineTranslationEnabled) savePreferences({ offlineTranslationEnabled: false });
    await localTranslator.stop(); await localPack.remove(); sendSettings(); return snapshot();
  });
  ipcMain.on('quit', event => { trust(event, [main]); app.quit(); });
}
const userDataOverride = app.commandLine.getSwitchValue('user-data-dir');
if (userDataOverride && path.isAbsolute(userDataOverride)) app.setPath('userData', userDataOverride);
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', showSettings);
  app.whenReady().then(async () => {
    nativeTheme.themeSource = 'dark';
    Menu.setApplicationMenu(null);
    try { preferences = validatePreferences(JSON.parse(fs.readFileSync(preferencesPath(), 'utf8'))); }
    catch (error) { if (error.code !== 'ENOENT') preferencesWarning = 'Saved settings could not be read. Default settings are active until you save new settings.'; }
    try { dictionary = parseDictionary(require('cedict-json')); } catch { dictionary = null; }
    localPack = new ModelPack(path.join(app.getPath('userData'), 'translation-packs'));
    localTranslator = new LocalTranslator(localPack, { workerFactory: utilityWorker });
    localPack.on('change', sendSettings); localTranslator.on('change', sendSettings);
    main = new BrowserWindow(options({ width: 900, height: 640, minWidth: 740, minHeight: 540, title: 'Hanzi Lens — Settings' }));
    protect(main);
    main.on('close', event => { if (!quitting) { event.preventDefault(); main.hide(); resumeShortcuts(); } });
    main.on('blur', resumeShortcuts);
    installIpc(); bind();
    // Linux's headless test backend has no native tray or GTK display.
    if (process.platform !== 'linux' || app.commandLine.getSwitchValue('ozone-platform') !== 'headless') {
      tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'tray.png')));
      tray.setToolTip('Hanzi Lens'); tray.on('double-click', showSettings); tray.on('click', showSettings); updateTray();
    }
    await main.loadFile(path.join(__dirname, 'index.html'));
    localPack.check().then(() => localTranslator.setEnabled(preferences.offlineTranslationEnabled)).catch(() => {});
  }).catch(error => { console.error('Hanzi Lens could not start:', error.message); app.quit(); });
}
app.on('window-all-closed', () => {});
app.on('before-quit', () => { quitting = true; });
app.on('will-quit', () => { localPack?.cancel(); localTranslator?.stop().catch(() => {}); globalShortcut.unregisterAll(); tray?.destroy(); workerPromise?.then(worker => worker.terminate()).catch(() => {}); });
// Also used by integration tests to invoke the same handlers as registered shortcuts.
module.exports = { selectedText, captureAction, savePreferences };

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require('playwright');
const { parseDictionary, lookup } = require('../src/dictionary.cjs');
const { defaults, validatePreferences } = require('../src/preferences.cjs');
const options = process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {};
fs.mkdirSync(path.resolve(__dirname, '../.cache'), { recursive: true });
async function load(page, filename) {
  await page.route('http://127.0.0.1:3000/**', route => route.fulfill({ path: path.resolve(__dirname, '../src', path.basename(new URL(route.request().url()).pathname)) }));
  await page.goto(`http://127.0.0.1:3000/${filename}`);
}
test('settings-only UI saves toggles and records shortcut keys without losing changes on blur', async () => {
  const browser = await chromium.launch({ ...options, headless: true });
  try {
    let preferences = { ...defaults, hasKey: false, dictionaryEntries: 124188, version: '0.2.0', shortcutErrors: [], warning: '' };
    const page = await browser.newPage({ viewport: { width: 900, height: 640 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.exposeFunction('readSettings', () => preferences);
    await page.exposeFunction('writeSettings', patch => {
      const next = validatePreferences(Object.fromEntries(Object.keys(defaults).map(key => [key, patch[key] ?? preferences[key]])));
      preferences = { ...preferences, ...next }; return preferences;
    });
    await page.addInitScript(() => { window.hanzi = {
      settings: () => window.readSettings(), saveSettings: patch => window.writeSettings(patch),
      shortcutRecording: async enabled => { if (!enabled && window.receiveSettings) window.receiveSettings(await window.readSettings()); },
      onSettings: callback => { window.receiveSettings = callback; }, capture: async () => {}, quit() {}
    }; });
    await load(page, 'index.html');
    await page.waitForFunction(() => document.getElementById('selection-hint').textContent.includes('Ctrl'));
    assert.equal(await page.locator('textarea').count(), 0);
    await page.screenshot({ path: path.resolve(__dirname, '../.cache/settings-v2.png') });
    await page.getByRole('checkbox', { name: 'Enable text selection' }).uncheck();
    await page.waitForFunction(() => !document.getElementById('selectionEnabled').disabled);
    assert.equal(preferences.selectionEnabled, false);
    await page.getByRole('button', { name: 'Shortcuts', exact: false }).first().click();
    await page.locator('#selectionShortcut').focus();
    await page.keyboard.press('Control+Alt+L');
    await page.getByRole('button', { name: 'Save shortcuts' }).click();
    await page.waitForFunction(() => document.getElementById('shortcut-status').textContent === 'Saved.');
    assert.equal(preferences.selectionShortcut, 'Control+Alt+L');
    await page.getByRole('button', { name: 'Lookup', exact: false }).first().click();
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
test('compact popup renders tone-colored rows in both scripts and exposes errors locally', async () => {
  const browser = await chromium.launch({ ...options, headless: true });
  try {
    const dictionary = parseDictionary(require('cedict-json'));
    const data = { id: 1, status: 'ready', text: '普音首', tokens: lookup(dictionary, '普音首'), source: 'selection', preferences: defaults, hasKey: false };
    const page = await browser.newPage({ viewport: { width: 520, height: 330 } });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(data => { window.hanzi = {
      result: async () => data, onResult: callback => { window.receiveResult = callback; },
      closePopup() {}, showSettings() {}, capture: async () => {}, translate: async () => 'English'
    }; }, data);
    await load(page, 'popup.html');
    await page.locator('#result').waitFor({ state: 'visible' });
    assert.equal(await page.locator('textarea').count(), 0);
    assert.ok(await page.locator('.tone-3').count() > 0);
    assert.match(await page.locator('#definitions').innerText(), /sound/);
    await page.screenshot({ path: path.resolve(__dirname, '../.cache/popup-v2.png') });
    await page.evaluate(data => window.receiveResult(data), { ...data, id: 2, text: '學習', tokens: lookup(dictionary, '學習'), preferences: { ...defaults, chineseStyle: 'simplified' } });
    assert.match(await page.locator('#characters').innerText(), /学/);
    await page.evaluate(data => window.receiveResult(data), { ...data, id: 3, status: 'error', error: 'No selected text found.' });
    assert.equal(await page.locator('#result').isVisible(), false);
    assert.match(await page.locator('#message').innerText(), /No selected text/);
    assert.deepEqual(errors, []);
  } finally { await browser.close(); }
});
test('capture crops a reversed drag with display scaling', async () => {
  const browser = await chromium.launch({ ...options, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.addInitScript(() => { window.hanzi = { onCapture: callback => { window.captureCallback = callback; }, recognize: async data => { window.capturedData = data; }, cancelCapture() {} }; });
    await load(page, 'capture.html');
    await page.evaluate(() => { const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = 1200; window.captureCallback(canvas.toDataURL()); });
    await page.waitForFunction(() => document.getElementById('capture').width === 1600);
    await page.mouse.move(300, 250); await page.mouse.down(); await page.mouse.move(100, 100); await page.mouse.up();
    await page.waitForFunction(() => window.capturedData);
    const size = await page.evaluate(async () => { const photo = new Image(); photo.src = window.capturedData; await photo.decode(); return [photo.width, photo.height]; });
    assert.deepEqual(size, [400, 300]);
  } finally { await browser.close(); }
});
test('language-pack controls expose progress and popup ignores outdated sentence results', async () => {
  const browser = await chromium.launch({ ...options, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 900, height: 800 } });
    const settings = { ...defaults, hasKey: false, dictionaryEntries: 124188, version: '0.3.0-beta.1', shortcutErrors: [], warning: '', localTranslation: { phase: 'missing', installed: false, engine: 'idle' } };
    await page.addInitScript(settings => { window.hanzi = {
      settings: async () => settings, onSettings: callback => { window.receiveSettings = callback; },
      installLanguagePack: async () => {
        const next = { ...settings, localTranslation: { phase: 'downloading', installed: false, engine: 'idle', bytes: 50, totalBytes: 100 } };
        window.receiveSettings(next); return next;
      }
    }; }, settings);
    await load(page, 'index.html'); await page.getByRole('button', { name: 'Translation', exact: false }).first().click();
    assert.equal(await page.getByRole('checkbox', { name: 'Enable offline sentence translation' }).isDisabled(), true);
    await page.getByRole('button', { name: 'Download language pack', exact: true }).click();
    assert.equal(await page.locator('#pack-progress').isVisible(), true);
    assert.equal(await page.locator('#pack-progress').getAttribute('value'), '50');
    assert.equal(await page.getByRole('button', { name: 'Cancel download' }).isVisible(), true);
    const dictionary = parseDictionary(require('cedict-json'));
    const data = { id: 10, status: 'ready', text: '你好。', tokens: lookup(dictionary, '你好。'), source: 'selection', preferences: { ...defaults, offlineTranslationEnabled: true }, localTranslation: { installed: true, engine: 'loading' }, translationStatus: 'loading', translationSource: 'offline' };
    const popup = await browser.newPage({ viewport: { width: 520, height: 380 } });
    await popup.addInitScript(data => { window.hanzi = { result: async () => data, onResult: callback => { window.receiveResult = callback; } }; }, data);
    await load(popup, 'popup.html'); await popup.locator('#result').waitFor({ state: 'visible' });
    assert.match(await popup.locator('#definitions').innerText(), /hello/);
    assert.match(await popup.locator('#sentence-status').innerText(), /Loading offline/);
    await popup.evaluate(data => window.receiveResult(data), { ...data, translationStatus: 'ready', translation: 'Hello.', localTranslation: { installed: true, engine: 'ready' } });
    assert.equal(await popup.locator('#translation').innerText(), 'Hello.');
    await popup.evaluate(data => window.receiveResult(data), { ...data, id: 9, translationStatus: 'ready', translation: 'Outdated result' });
    assert.equal(await popup.locator('#translation').innerText(), 'Hello.');
  } finally { await browser.close(); }
});

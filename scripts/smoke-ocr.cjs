const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createOcrWorker } = require('../src/ocr.cjs');
const { parseDictionary, lookup } = require('../src/dictionary.cjs');
(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  let worker;
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 200 }, deviceScaleFactor: 1 });
    await page.setContent('<html lang="zh"><body style="margin:0;background:white"><div style="padding:30px;font:60px sans-serif;color:black">你好世界 学习中文 學習中文</div></body></html>');
    const image = await page.screenshot();
    worker = await createOcrWorker(path.resolve(__dirname, '../resources'), path.resolve(__dirname, '../.cache'));
    const { data } = await worker.recognize(image);
    const recognized = data.text.replace(/\s+/g, '');
    assert.ok(recognized.includes('你好'), `OCR output: ${recognized}`);
    assert.ok(recognized.includes('中文'), `OCR output: ${recognized}`);
    const tokens = lookup(parseDictionary(require('cedict-json')), recognized);
    assert.ok(tokens.some(token => token.entries.some(entry => entry.definitions.some(definition => definition.includes('hello')))));
    console.log(`OCR → dictionary smoke passed: ${data.text.trim()}`);
  } finally { if (worker) await worker.terminate(); await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });

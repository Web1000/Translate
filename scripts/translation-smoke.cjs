const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { ModelPack } = require('../src/model-pack.cjs');
const { LocalTranslator } = require('../src/local-translator.cjs');
(async () => {
  const pack = new ModelPack(process.env.HANZI_TRANSLATION_PACKS || path.resolve(__dirname, '../.cache/language-packs'));
  pack.on('change', state => { if (state.phase === 'downloading' && state.totalBytes) process.stdout.write(`\rLanguage pack: ${(100 * state.bytes / state.totalBytes).toFixed(0)}%`); });
  if (!await pack.check()) {
    if (!process.argv.includes('--install')) throw new Error('Language pack missing. Run npm run test:translation -- --install to download and verify it first.');
    await pack.install(); console.log('\nLanguage pack license, revision, sizes, and checksums verified.');
  }
  const engine = new LocalTranslator(pack);
  try {
    const started = performance.now(); await engine.setEnabled(true);
    if (engine.snapshot().engine !== 'ready') throw new Error(engine.snapshot().engineError || 'Model did not load.');
    const loadMs = Math.round(performance.now() - started), results = [];
    for (const input of ['你好，世界。', '我喜欢学习中文。', '我喜歡學習中文。', '请问，最近的火车站在哪里？']) {
      const output = await engine.translate(input); results.push({ input, ...output });
    }
    assert.match(results[0].text, /hello/i); assert.match(results[0].text, /world/i);
    assert.match(results[1].text, /Chinese/i); assert.equal(results[1].text, results[2].text);
    assert.match(results[3].text, /station/i);
    const manifest = JSON.parse(await fs.readFile(path.join(pack.root, 'pack.json'), 'utf8'));
    const report = { model: manifest.model, modelRevision: manifest.revision, modelLicense: manifest.license, runtime: process.version, platform: process.platform, arch: process.arch, availableCpus: os.availableParallelism(), cpuThreads: 2, modelLoadAndWarmMs: loadMs, processRssMB: Math.round(process.memoryUsage().rss / 1024 / 1024), results };
    const reportPath = path.resolve(__dirname, '../.cache/translation-benchmark.json'); await fs.mkdir(path.dirname(reportPath), { recursive: true }); await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report, null, 2));
  } finally { await engine.stop(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

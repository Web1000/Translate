const fs = require('node:fs/promises');
const { ModelPack } = require('../src/model-pack.cjs');
const { translationChunks } = require('../src/translation-text.cjs');
(async () => {
  const pack = new ModelPack('.cache/language-packs');
  if (!await pack.check()) await pack.install();
  const cases = require('../test/fixtures/translation-cases.json');
  await fs.mkdir('.cache/translation-evaluation', { recursive: true });
  await fs.writeFile('.cache/translation-evaluation/prepared-cases.json', JSON.stringify(cases.map(item => ({ ...item, chunks: translationChunks(item.input) })), null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });

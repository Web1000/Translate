const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { createHash } = require('node:crypto');
const { ModelPack, MODEL, SOURCE_MODEL, REQUIRED, describeFiles, verifyPack } = require('../src/model-pack.cjs');
function fixture() {
  const contents = Object.fromEntries(REQUIRED.map(name => [name, Buffer.from(name === 'config.json' ? '{"model_type":"marian"}' : name)]));
  const metadata = { sha: 'a'.repeat(40), cardData: { license: 'apache-2.0' }, siblings: Object.entries(contents).map(([rfilename, data]) => ({ rfilename, size: data.length, blobId: createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex'), ...(rfilename.endsWith('.onnx') ? { lfs: { size: data.length, sha256: createHash('sha256').update(data).digest('hex') } } : {}) })) };
  return { contents, metadata };
}
test('model manifest requires an accepted license, immutable revision, and checksums', () => {
  const { metadata } = fixture(); assert.equal(describeFiles(metadata).length, REQUIRED.length);
  assert.throws(() => describeFiles({ ...metadata, sha: 'main' }), /immutable/);
  assert.throws(() => describeFiles({ ...metadata, cardData: {} }), /license/);
  assert.throws(() => describeFiles({ ...metadata, siblings: [] }), /missing/);
  const lfs = structuredClone(metadata); lfs.siblings[0].lfs = { size: 50, sha256: 'b'.repeat(64) };
  assert.equal(describeFiles(lfs)[0].algorithm, 'sha256');
});
test('conversion uses a verified declared base-model license and retains its attribution', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hanzi-pack-'));
  try {
    const { metadata, contents } = fixture(); metadata.cardData = { base_model: SOURCE_MODEL };
    const source = { ...structuredClone(metadata), id: SOURCE_MODEL, sha: 'b'.repeat(40), cardData: { license: 'cc-by-4.0' } };
    assert.throws(() => describeFiles(metadata), /license/);
    assert.throws(() => describeFiles({ ...metadata, cardData: { license: 'proprietary', base_model: SOURCE_MODEL } }, source), /license/);
    const pack = new ModelPack(directory, { json: async url => url.includes(SOURCE_MODEL) ? source : metadata, download: async (url, filename) => {
      const name = url.split('/resolve/')[1].split('/').slice(1).join('/'); await fs.writeFile(filename, contents[name]);
    } });
    await pack.install(); const manifest = await verifyPack(pack.root);
    assert.equal(manifest.license, 'cc-by-4.0'); assert.equal(manifest.licenseSource.repository, SOURCE_MODEL);
    assert.equal((await fs.readFile(path.join(pack.root, 'SOURCE-README.md'))).toString(), contents['README.md'].toString());
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('verified pack installs atomically, detects corruption, and removes cleanly', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hanzi-pack-'));
  try {
    const { metadata, contents } = fixture();
    const pack = new ModelPack(directory, { json: async () => metadata, download: async (url, filename) => {
      assert.ok(url.includes('/resolve/' + metadata.sha + '/'));
      const name = decodeURIComponent(url.split(`/resolve/${metadata.sha}/`)[1]);
      await fs.writeFile(filename, contents[name]);
    } });
    assert.equal(await pack.check(), false);
    await pack.install(); assert.equal(pack.state.installed, true);
    assert.equal((await verifyPack(pack.root)).model, MODEL.id);
    await fs.writeFile(path.join(pack.root, 'tokenizer.json'), 'damaged');
    assert.equal(await pack.check(), false); assert.match(pack.state.error, /damaged/);
    await pack.remove(); assert.equal(pack.state.phase, 'missing');
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
test('checksum failure and cancellation leave no partial pack behind', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'hanzi-pack-'));
  try {
    const { metadata } = fixture();
    const bad = new ModelPack(directory, { json: async () => metadata, download: async (_url, filename) => fs.writeFile(filename, 'bad content') });
    await assert.rejects(bad.install(), /Checksum/);
    assert.deepEqual(await fs.readdir(directory), []);
    const canceled = new ModelPack(directory, { json: async () => metadata, download: async (_url, _filename, signal) => new Promise((_resolve, reject) => { signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }); setImmediate(() => canceled.cancel()); }) });
    await assert.rejects(canceled.install(), /canceled/);
    assert.equal(canceled.state.phase, 'missing'); assert.deepEqual(await fs.readdir(directory), []);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});

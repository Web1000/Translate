// Research only. Verified model files stay under .cache and are never packaged.
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { digest } = require('../src/model-pack.cjs');
const { translationChunks } = require('../src/translation-text.cjs');
const run = promisify(execFile);
const ROOT = path.resolve(__dirname, '..');
const CANDIDATES = {
  opus: { model: 'Xenova/opus-mt-zh-en', revision: '39d480d52a9ea3065a1f117adfe4dbc55de10e6f', source: 'Helsinki-NLP/opus-mt-zh-en', sourceRevision: 'cf109095479db38d6df799875e34039d4938aaa6', type: 'marian', task: 'translation' },
  m2m100: { model: 'Xenova/m2m100_418M', revision: '9c374f0b7aca709787cea97b047bfbbd1559d177', source: 'facebook/m2m100_418M', sourceRevision: '55c2e61bbf05dfb8d7abccdc3fae6fc8512fd636', type: 'm2m_100', task: 'translation', languages: { src_lang: 'zh', tgt_lang: 'en' } },
  madlad: { model: 'Kutalia/madlad400-3b-mt-onnx', revision: '066656188a5390d1d0af6e824707a12cf28fc309', source: 'google/madlad400-3b-mt', sourceRevision: 'fa184c675da0b5c9e1c8694fccd4e12e2d422094', type: 't5', task: 'text2text-generation', prefix: '<2en> ' }
};
const LICENSES = new Set(['apache-2.0', 'mit', 'cc-by-4.0']);
const CURL = ['--fail', '--location', '--silent', '--show-error', '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '30', '--max-time', '900', '--retry', '2'];
const MAX_PACK = 6 * 1024 ** 3;
const MAX_FILE = 4 * 1024 ** 3;
async function json(url) {
  const { stdout } = await run('curl', [...CURL, url], { maxBuffer: 8 * 1024 ** 2, windowsHide: true });
  return JSON.parse(stdout);
}
function describe(file) {
  const algorithm = file.lfs ? 'sha256' : 'sha1';
  const hash = file.lfs?.sha256 || file.blobId;
  const size = file.lfs?.size || file.size;
  if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_FILE || !(algorithm === 'sha256' ? /^[a-f0-9]{64}$/ : /^[a-f0-9]{40}$/).test(hash || '')) throw new Error(`Missing file integrity metadata: ${file.rfilename}`);
  return { name: file.rfilename, size, hash, algorithm, gitBlob: !file.lfs };
}
async function verifiedDownload(model, revision, description, destination) {
  try {
    if ((await fs.stat(destination)).size === description.size && await digest(destination, description.algorithm, description.gitBlob) === description.hash) return;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const partial = `${destination}.partial`;
  const remote = description.name.split('/').map(encodeURIComponent).join('/');
  try {
    console.log(`Downloading ${model}: ${description.name} (${description.size} bytes)`);
    await run('curl', [...CURL, '--max-filesize', String(description.size), '--output', partial, `https://huggingface.co/${model}/resolve/${revision}/${remote}`], { maxBuffer: 1024 ** 2, windowsHide: true });
    if ((await fs.stat(partial)).size !== description.size || await digest(partial, description.algorithm, description.gitBlob) !== description.hash) throw new Error(`File verification failed: ${description.name}`);
    await fs.rename(partial, destination);
  } finally { await fs.rm(partial, { force: true }); }
}
async function prepare(candidate, directory) {
  const [metadata, source] = await Promise.all([
    json(`https://huggingface.co/api/models/${candidate.model}/revision/${candidate.revision}?blobs=true`),
    json(`https://huggingface.co/api/models/${candidate.source}/revision/${candidate.sourceRevision}?blobs=true`)
  ]);
  for (const item of [metadata, source]) if (!/^[a-f0-9]{40}$/.test(item.sha || '')) throw new Error('Immutable model revision required.');
  if (metadata.sha !== candidate.revision || source.sha !== candidate.sourceRevision) throw new Error('Unexpected model revision.');
  if (metadata.id !== candidate.model || source.id !== candidate.source) throw new Error('Unexpected model identity.');
  // A conversion may inherit only from its explicitly declared expected base model.
  const base = metadata.cardData?.base_model;
  const inherited = base === candidate.source || Array.isArray(base) && base.includes(candidate.source);
  const declared = metadata.cardData?.license;
  const sourceLicense = source.cardData?.license;
  if (!LICENSES.has(sourceLicense) || !(LICENSES.has(declared) || !declared && inherited)) throw new Error(`Model license needs review: ${JSON.stringify({ declared, sourceLicense, base })}`);
  const files = metadata.siblings.filter(file =>
    /^[^/]+\.json$/.test(file.rfilename) || /^onnx\/(encoder_model|decoder_model_merged)_quantized\.onnx(_data)?$/.test(file.rfilename) || /^(README\.md|LICENSE(\.txt|\.md)?)$/i.test(file.rfilename)
  ).map(describe);
  for (const name of ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'README.md', 'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx']) if (!files.some(file => file.name === name)) throw new Error(`Missing required ONNX file: ${name}`);
  const total = files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_PACK) throw new Error(`Model exceeds research download budget: ${total}`);
  for (const file of files) await verifiedDownload(candidate.model, metadata.sha, file, path.join(directory, file.name));
  const attribution = source.siblings.find(file => file.rfilename === 'README.md');
  if (!attribution) throw new Error('Missing source attribution.');
  await verifiedDownload(candidate.source, source.sha, describe(attribution), path.join(directory, 'SOURCE-README.md'));
  const config = JSON.parse(await fs.readFile(path.join(directory, 'config.json'), 'utf8'));
  if (config.model_type !== candidate.type) throw new Error(`Unexpected model type: ${config.model_type}`);
  const manifest = { model: candidate.model, revision: metadata.sha, source: candidate.source, sourceRevision: source.sha, license: declared || sourceLicense, sourceLicense, downloadBytes: total + attribution.size, files };
  await fs.writeFile(path.join(directory, 'research-manifest.json'), JSON.stringify(manifest, null, 2));
  return manifest;
}
async function main() {
  const key = process.argv[2];
  const candidate = CANDIDATES[key];
  if (!candidate) throw new Error(`Expected candidate: ${Object.keys(CANDIDATES).join(', ')}`);
  const directory = path.join(ROOT, '.cache', 'translation-quality', key);
  const reportPath = path.join(directory, 'report.json');
  await fs.mkdir(directory, { recursive: true });
  const report = { status: 'running', candidate: key, platform: process.platform, arch: process.arch, runtime: process.version,
    transformers: require('../package.json').dependencies['@huggingface/transformers'],
    cpu: os.cpus()[0]?.model, availableCpus: os.availableParallelism(), systemMemoryMB: Math.round(os.totalmem() / 1048576), cpuThreads: 2,
    dtype: 'q8', decoding: { num_beams: 1, max_new_tokens: 256 }, results: [],
    limitations: 'Manually authored diagnostic cases, not a representative accuracy score. CPU timings include tokenization and decode after one warmup. Memory is the research process, not the complete app. All engines receive the same app OpenCC normalization and chunks. Word cases diagnose raw engines; the app uses dictionary definitions for recognized words.' };
  const save = () => fs.writeFile(reportPath, JSON.stringify(report, null, 2));
  let translator;
  try {
    report.model = await prepare(candidate, path.join(directory, 'model'));
    await save();
    const { pipeline, env } = require('@huggingface/transformers');
    env.allowRemoteModels = false; env.useFSCache = false; env.useBrowserCache = false;
    const started = performance.now();
    translator = await pipeline(candidate.task, path.join(directory, 'model'), { device: 'cpu', dtype: 'q8', local_files_only: true,
      session_options: { intraOpNumThreads: 2, interOpNumThreads: 1, executionMode: 'sequential' } });
    const translate = async text => {
      const output = await translator((candidate.prefix || '') + text, { ...report.decoding, ...candidate.languages });
      const value = output[0].translation_text ?? output[0].generated_text;
      if (typeof value !== 'string' || !value.trim()) throw new Error('Engine produced an empty translation.');
      return value.trim();
    };
    await translate('你好。');
    report.loadAndWarmMs = Math.round(performance.now() - started);
    const cases = [...require('../test/fixtures/translation-cases.json'), ...require('../test/fixtures/translation-quality-cases.json')];
    if (new Set(cases.map(item => item.id)).size !== cases.length) throw new Error('Duplicate case IDs.');
    for (const item of cases) {
      const before = performance.now();
      const chunks = translationChunks(item.input);
      let text = '';
      for (const chunk of chunks) text += await translate(chunk.text) + chunk.separator;
      const result = { id: item.id, kind: item.kind, input: item.input, referenceMeaning: item.reference, normalizedChunks: chunks, text: text.trim(), elapsedMs: Math.round(performance.now() - before) };
      // Also measure whether retaining sentence context changes passage meaning.
      // Keep the primary comparison identical to the released app's chunking.
      if (chunks.length > 1) {
        const contextInput = chunks.map(chunk => chunk.text + chunk.separator).join('').trim();
        const contextStarted = performance.now();
        result.fullContext = { input: contextInput, text: await translate(contextInput), elapsedMs: Math.round(performance.now() - contextStarted) };
      }
      report.results.push(result);
      report.processRssMB = Math.round(process.memoryUsage().rss / 1048576);
      report.maxSampledProcessRssMB = Math.max(report.maxSampledProcessRssMB || 0, report.processRssMB);
      await save();
      console.log(JSON.stringify({ id: item.id, text: result.text, elapsedMs: result.elapsedMs }));
    }
    report.status = 'completed';
  } catch (error) {
    report.status = 'failed';
    // curl command errors can contain signed host URLs; keep them out of logs.
    report.error = String(error.stderr || error.message).replace(/https?:\/\/\S+/g, '[model host]').slice(-1500);
    process.exitCode = 1;
  } finally {
    await translator?.dispose();
    await save();
    console.log(JSON.stringify({ candidate: key, status: report.status, cases: report.results.length, error: report.error }));
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });

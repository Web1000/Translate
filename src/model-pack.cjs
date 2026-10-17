const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const { EventEmitter } = require('node:events');
const run = promisify(execFile);
const MODEL = Object.freeze({ id: 'Xenova/opus-mt-zh-en', packId: 'opus-zh-en-q8-v1', label: 'Chinese → English · OPUS-MT int8', license: 'apache-2.0' });
const REQUIRED = ['config.json', 'tokenizer.json', 'tokenizer_config.json', 'onnx/encoder_model_quantized.onnx', 'onnx/decoder_model_merged_quantized.onnx', 'README.md'];
const OPTIONAL = ['generation_config.json', 'special_tokens_map.json', 'LICENSE', 'LICENSE.txt'];
const ALLOWED = new Set([...REQUIRED, ...OPTIONAL]);
const MAX_BYTES = 400 * 1024 * 1024;
const CURL = ['--fail', '--location', '--silent', '--show-error', '--proto', '=https', '--proto-redir', '=https', '--connect-timeout', '20', '--max-time', '600', '--retry', '2'];
async function defaultJson(url, signal) {
  const { stdout } = await run('curl', [...CURL, url], { signal, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout);
}
async function defaultDownload(url, filename, signal) {
  await run('curl', [...CURL, '--max-filesize', String(MAX_BYTES), '--output', filename, url], { signal, windowsHide: true, maxBuffer: 1024 * 1024 });
}
async function digest(filename, algorithm, gitBlob = false) {
  const hash = createHash(algorithm);
  if (gitBlob) hash.update(`blob ${(await fsp.stat(filename)).size}\0`);
  for await (const chunk of fs.createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}
function describeFiles(metadata) {
  if (!/^[a-f0-9]{40}$/.test(metadata.sha || '')) throw new Error('The model host did not provide an immutable revision.');
  if (metadata.cardData?.license !== MODEL.license) throw new Error('The language pack license could not be verified as Apache 2.0.');
  const siblings = new Map((metadata.siblings || []).map(file => [file.rfilename, file]));
  for (const name of REQUIRED) if (!siblings.has(name)) throw new Error(`The language pack is missing ${name}.`);
  const files = [...ALLOWED].filter(name => siblings.has(name)).map(name => {
    const file = siblings.get(name), lfs = file.lfs;
    const algorithm = lfs ? 'sha256' : 'sha1';
    const hash = lfs?.sha256 || file.blobId;
    const size = lfs?.size || file.size;
    if (!Number.isSafeInteger(size) || size <= 0 || size > MAX_BYTES || !(algorithm === 'sha256' ? /^[a-f0-9]{64}$/ : /^[a-f0-9]{40}$/).test(hash || '')) throw new Error(`The host did not supply a checksum and size for ${name}.`);
    return { name, size, hash, algorithm, gitBlob: !lfs };
  });
  if (files.reduce((sum, file) => sum + file.size, 0) > MAX_BYTES) throw new Error('Unexpectedly large language pack. Download stopped.');
  return files;
}
async function verifyPack(root) {
  const manifest = JSON.parse(await fsp.readFile(path.join(root, 'pack.json'), 'utf8'));
  if (manifest.model !== MODEL.id || manifest.packId !== MODEL.packId || manifest.license !== MODEL.license || !/^[a-f0-9]{40}$/.test(manifest.revision || '') || !Array.isArray(manifest.files)) throw new Error('Unrecognized language pack.');
  const names = new Set(manifest.files.map(file => file.name));
  if (names.size !== manifest.files.length || REQUIRED.some(name => !names.has(name))) throw new Error('Incomplete language pack.');
  for (const file of manifest.files) {
    if (!ALLOWED.has(file.name) || !['sha1', 'sha256'].includes(file.algorithm) || !Number.isSafeInteger(file.size) || file.size <= 0 || file.size > MAX_BYTES) throw new Error('Invalid language pack manifest.');
    const filename = path.join(root, file.name);
    if ((await fsp.lstat(filename)).isSymbolicLink() || (await fsp.stat(filename)).size !== file.size || await digest(filename, file.algorithm, file.gitBlob) !== file.hash) throw new Error(`Language pack file damaged: ${file.name}. Remove and download the pack again.`);
  }
  const config = JSON.parse(await fsp.readFile(path.join(root, 'config.json'), 'utf8'));
  if (config.model_type !== 'marian') throw new Error('Unexpected translation model type.');
  return manifest;
}
class ModelPack extends EventEmitter {
  constructor(parent, { json = defaultJson, download = defaultDownload } = {}) {
    super(); this.parent = parent; this.root = path.join(parent, MODEL.packId); this.json = json; this.download = download;
    this.state = { phase: 'checking', installed: false, bytes: 0, totalBytes: 0, error: '', label: MODEL.label };
  }
  update(patch) { Object.assign(this.state, patch); this.emit('change', { ...this.state }); }
  async check() {
    try { const manifest = await verifyPack(this.root); this.update({ phase: 'installed', installed: true, bytes: 0, totalBytes: manifest.files.reduce((sum, file) => sum + file.size, 0), error: '' }); return true; }
    catch (error) { this.update({ phase: error.code === 'ENOENT' ? 'missing' : 'error', installed: false, error: error.code === 'ENOENT' ? '' : error.message }); return false; }
  }
  install() {
    if (this.installing) return this.installing;
    this.installing = this.performInstall().finally(() => { this.installing = null; this.controller = null; });
    return this.installing;
  }
  async performInstall() {
    const controller = this.controller = new AbortController(), { signal } = controller;
    const staging = `${this.root}.partial-${randomUUID()}`;
    this.update({ phase: 'downloading', bytes: 0, totalBytes: 0, error: '' });
    try {
      const metadata = await this.json(`https://huggingface.co/api/models/${MODEL.id}?blobs=true`, signal);
      const files = describeFiles(metadata), totalBytes = files.reduce((sum, file) => sum + file.size, 0);
      this.update({ totalBytes }); await fsp.mkdir(staging, { recursive: true });
      let completed = 0;
      for (const file of files) {
        if (signal.aborted) throw new Error('Download canceled.');
        const destination = path.join(staging, file.name); await fsp.mkdir(path.dirname(destination), { recursive: true });
        const baseBytes = completed; let reporting = true;
        const timer = setInterval(() => { fsp.stat(destination).then(stat => { if (reporting && !signal.aborted) this.update({ bytes: Math.min(totalBytes, baseBytes + stat.size) }); }).catch(() => {}); }, 600);
        timer.unref();
        try {
          const fileUrl = file.name.split('/').map(encodeURIComponent).join('/');
          await this.download(`https://huggingface.co/${MODEL.id}/resolve/${metadata.sha}/${fileUrl}`, destination, signal);
        } finally { reporting = false; clearInterval(timer); }
        if ((await fsp.stat(destination)).size !== file.size || await digest(destination, file.algorithm, file.gitBlob) !== file.hash) throw new Error(`Checksum verification failed for ${file.name}. Download stopped.`);
        completed += file.size; this.update({ bytes: completed });
      }
      this.update({ phase: 'verifying' });
      await fsp.writeFile(path.join(staging, 'pack.json'), JSON.stringify({ packId: MODEL.packId, model: MODEL.id, revision: metadata.sha, license: MODEL.license, files }, null, 2));
      await verifyPack(staging);
      if (signal.aborted) throw new Error('Download canceled.');
      await fsp.mkdir(this.parent, { recursive: true });
      const backup = `${this.root}.previous`;
      await fsp.rm(backup, { recursive: true, force: true });
      let backedUp = false;
      try { await fsp.rename(this.root, backup); backedUp = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      try { await fsp.rename(staging, this.root); }
      catch (error) { if (backedUp) await fsp.rename(backup, this.root); throw error; }
      await fsp.rm(backup, { recursive: true, force: true });
      this.update({ phase: 'installed', installed: true, error: '', bytes: totalBytes });
      return { ...this.state };
    } catch (error) {
      this.update({ phase: signal.aborted ? (this.state.installed ? 'installed' : 'missing') : 'error', error: signal.aborted ? '' : `Language pack download failed. Check your connection and free disk space. ${error.message.startsWith('Command failed:') ? '' : error.message}` });
      throw new Error(signal.aborted ? 'Download canceled.' : this.state.error);
    } finally { await fsp.rm(staging, { recursive: true, force: true }); }
  }
  cancel() { this.controller?.abort(); }
  async remove() {
    if (this.installing) throw new Error('Cancel the language pack download before removing it.');
    await fsp.rm(this.root, { recursive: true, force: true });
    this.update({ phase: 'missing', installed: false, bytes: 0, totalBytes: 0, error: '' });
  }
}
module.exports = { MODEL, REQUIRED, OPTIONAL, describeFiles, verifyPack, digest, ModelPack };

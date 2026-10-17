const path = require('node:path');
const os = require('node:os');
const { Worker } = require('node:worker_threads');
const { EventEmitter } = require('node:events');
class LocalTranslator extends EventEmitter {
  constructor(pack, { workerFactory = filename => new Worker(filename), timeoutMs = 90000 } = {}) {
    super(); this.pack = pack; this.workerFactory = workerFactory; this.timeoutMs = timeoutMs;
    this.worker = null; this.loaded = false; this.loading = null; this.enabled = false;
    this.active = null; this.queued = null; this.sequence = 0; this.intent = 0; this.engineError = '';
  }
  snapshot() {
    return { ...this.pack.state, enabled: this.enabled, engine: this.engineError ? 'error' : this.loaded ? 'ready' : this.loading ? 'loading' : 'idle', engineError: this.engineError };
  }
  changed() { this.emit('change', this.snapshot()); }
  async setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) { this.engineError = ''; await this.stop(); return; }
    this.engineError = '';
    if (this.pack.state.installed) { try { await this.warm(); } catch { /* Status exposes the startup failure; dictionary remains available. */ } }
    this.changed();
  }
  warm() {
    if (!this.enabled || !this.pack.state.installed) return Promise.reject(new Error('Download and enable the offline language pack in Settings → Translation.'));
    if (this.loaded) return Promise.resolve();
    if (this.loading) return this.loading;
    if (this.engineError) return Promise.reject(new Error(this.engineError));
    this.engineError = '';
    let resolveLoad, rejectLoad;
    const promise = new Promise((resolve, reject) => { resolveLoad = resolve; rejectLoad = reject; });
    this.loading = promise; this.rejectLoad = rejectLoad;
    try {
      const filename = path.join(__dirname, 'local-translation-worker.cjs').replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
      const worker = this.worker = this.workerFactory(filename);
      this.loadTimer = setTimeout(() => this.fail(new Error('The offline model took too long to load. Try turning sentence translation off and on.')), this.timeoutMs);
      this.loadTimer.unref?.();
      worker.on('message', message => {
        if (this.worker !== worker) return;
        if (message.type === 'loaded') {
          clearTimeout(this.loadTimer); this.loaded = true; this.loading = null; this.rejectLoad = null; resolveLoad(); this.changed();
        } else if (message.type === 'translated' || message.type === 'error' && message.id !== undefined) {
          const active = this.active;
          if (!active || active.id !== message.id) return;
          clearTimeout(active.timer); this.active = null;
          if (message.type === 'error') active.reject(new Error(message.error)); else active.resolve({ text: message.text, elapsedMs: message.elapsedMs });
          this.drain();
        } else if (message.type === 'error') this.fail(new Error(message.error));
      });
      worker.on('error', error => { if (this.worker === worker) this.fail(error); });
      worker.on('exit', code => { if (this.worker === worker) this.fail(new Error(`Translation worker stopped (${code}).`)); });
      worker.postMessage({ type: 'load', root: this.pack.root, threads: Math.max(1, Math.min(2, (os.availableParallelism?.() || os.cpus().length) - 1)) });
    } catch (error) { this.fail(error); }
    this.changed(); return promise;
  }
  fail(error) {
    this.engineError = `Offline translation could not start or finish. ${error.message}`;
    this.stop(new Error(this.engineError)).catch(() => {}); this.changed();
  }
  async translate(text) {
    if (typeof text !== 'string' || !text.trim() || [...text].length > 2000) throw new Error('Offline translation supports between 1 and 2,000 characters. Select a shorter passage.');
    const intent = ++this.intent;
    await this.warm();
    if (intent !== this.intent) throw new Error('Translation canceled.');
    if (!this.enabled || !this.loaded) throw new Error('Offline translation is turned off.');
    return new Promise((resolve, reject) => {
      if (this.queued) this.queued.reject(new Error('Translation canceled.'));
      this.queued = { id: ++this.sequence, text, resolve, reject };
      if (this.active) this.worker.postMessage({ type: 'cancel', id: this.active.id });
      this.drain();
    });
  }
  cancel() {
    this.intent++;
    if (this.queued) { this.queued.reject(new Error('Translation canceled.')); this.queued = null; }
    if (this.active) this.worker?.postMessage({ type: 'cancel', id: this.active.id });
  }
  drain() {
    if (this.active || !this.queued || !this.worker || !this.loaded) return;
    this.active = this.queued; this.queued = null;
    this.active.timer = setTimeout(() => this.fail(new Error('Translation timed out. Select a shorter passage.')), this.timeoutMs);
    this.active.timer.unref?.();
    this.worker.postMessage({ type: 'translate', id: this.active.id, text: this.active.text });
  }
  async stop(reason = new Error('Translation canceled.')) {
    this.intent++;
    clearTimeout(this.loadTimer);
    if (this.rejectLoad) this.rejectLoad(reason);
    this.rejectLoad = null; this.loading = null; this.loaded = false;
    if (this.active) { clearTimeout(this.active.timer); this.active.reject(reason); this.active = null; }
    if (this.queued) { this.queued.reject(reason); this.queued = null; }
    const worker = this.worker; this.worker = null;
    if (worker) {
      const stopping = this.stopping = worker.terminate();
      try { await stopping; } finally { if (this.stopping === stopping) this.stopping = null; }
    } else if (this.stopping) await this.stopping;
    this.changed();
  }
}
module.exports = { LocalTranslator };

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { LocalTranslator } = require('../src/local-translator.cjs');
const { translationChunks } = require('../src/translation-text.cjs');
const tick = () => new Promise(resolve => setImmediate(resolve));
class FakeWorker extends EventEmitter {
  constructor() { super(); this.messages = []; }
  postMessage(message) { this.messages.push(message); if (message.type === 'load') setImmediate(() => this.emit('message', { type: 'loaded' })); }
  async terminate() { this.stopped = true; }
}
function fixture() { const worker = new FakeWorker(); const translator = new LocalTranslator({ root: '/pack', state: { installed: true } }, { workerFactory: () => worker }); return { worker, translator }; }
test('Traditional text is normalized, paragraph breaks survive, and long input is bounded', () => {
  assert.equal(translationChunks('我喜歡學習中文。')[0].text, '我喜欢学习中文。');
  const chunks = translationChunks('你好。\n歡迎。'); assert.equal(chunks[0].separator, '\n');
  const long = translationChunks('學'.repeat(400)); assert.ok(long.every(chunk => [...chunk.text].length <= 160)); assert.equal(long.map(chunk => chunk.text).join(''), '学'.repeat(400));
  assert.throws(() => translationChunks('中'.repeat(2001)), /2,000/);
  const amount = '订单金额是128.50元，版本是1.2.3。';
  assert.deepEqual(translationChunks(amount), [{ text: amount, separator: ' ' }]);
});
test('engine keeps one loaded worker, cancels stale work, and releases memory on disable', async () => {
  const { worker, translator } = fixture();
  await translator.setEnabled(true); assert.equal(translator.snapshot().engine, 'ready');
  const first = translator.translate('你好。'); first.catch(() => {}); await tick();
  const firstId = worker.messages.at(-1).id;
  const second = translator.translate('再见。'); await tick();
  assert.ok(worker.messages.some(message => message.type === 'cancel' && message.id === firstId));
  worker.emit('message', { type: 'error', id: firstId, error: 'Translation canceled.' });
  await assert.rejects(first, /canceled/);
  const secondId = worker.messages.at(-1).id;
  worker.emit('message', { type: 'translated', id: secondId, text: 'Goodbye.', elapsedMs: 100 });
  assert.deepEqual(await second, { text: 'Goodbye.', elapsedMs: 100 });
  assert.equal(worker.messages.filter(message => message.type === 'load').length, 1);
  await translator.setEnabled(false); assert.equal(worker.stopped, true);
});
test('new lookups cancel older requests that are still waiting for model loading', async () => {
  const worker = new FakeWorker(); worker.postMessage = message => worker.messages.push(message);
  const translator = new LocalTranslator({ root: '/pack', state: { installed: true } }, { workerFactory: () => worker });
  const enabling = translator.setEnabled(true);
  const old = translator.translate('你好。'); old.catch(() => {});
  translator.cancel(); worker.emit('message', { type: 'loaded' });
  await enabling; await assert.rejects(old, /canceled/);
  assert.equal(worker.messages.some(message => message.type === 'translate'), false);
  await translator.stop();
});
test('worker startup errors remain recoverable and never call an online service', async () => {
  const { worker, translator } = fixture();
  await translator.setEnabled(true);
  worker.emit('error', new Error('unsupported CPU'));
  await tick(); assert.match(translator.snapshot().engineError, /unsupported CPU/);
  await translator.setEnabled(false); assert.equal(translator.snapshot().engineError, '');
});

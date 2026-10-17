const { test } = require('node:test');
const assert = require('node:assert/strict');
const { translate } = require('../src/translation.cjs');
test('translation requires explicit key and valid input', async () => {
  await assert.rejects(translate('你好', ''), /API key/);
  await assert.rejects(translate('', 'fake-key'), /characters/);
  await assert.rejects(translate('中'.repeat(10001), 'fake-key'), /characters/);
});
test('translation request avoids storage and extracts the response text', async () => {
  const result = await translate('你好', 'test-only', async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body);
    assert.equal(body.store, false); assert.equal(body.input, '你好');
    return { ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Hello.' }] }] }) };
  });
  assert.equal(result, 'Hello.');
});
test('service failures and empty responses remain visible', async () => {
  await assert.rejects(translate('你好', 'test-only', async () => ({ ok: false, status: 401 })), /HTTP 401/);
  await assert.rejects(translate('你好', 'test-only', async () => ({ ok: true, json: async () => ({ output: [] }) })), /no text/);
});

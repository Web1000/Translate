// Research runner: compare tokenizer paths with exactly the same ONNX weights.
const fs = require('node:fs/promises');
const { pipeline, Tensor, env } = require('@huggingface/transformers');
(async () => {
  const root = process.argv[2], directory = process.argv[3];
  const prepared = JSON.parse(await fs.readFile(`${directory}/encoded-cases.json`, 'utf8'));
  env.allowRemoteModels = false; env.useFSCache = false; env.useBrowserCache = false;
  const started = performance.now();
  const translator = await pipeline('translation', root, { device: 'cpu', dtype: 'q8', local_files_only: true, session_options: { intraOpNumThreads: 2, interOpNumThreads: 1, executionMode: 'sequential' } });
  await translator('你好。', { max_new_tokens: 32, num_beams: 1 });
  const warmMs = Math.round(performance.now() - started), results = [];
  for (const item of prepared) {
    let baseline = '', baselineMs = 0, referenceMs = 0;
    const generated = [], tokenDifferences = [];
    for (const chunk of item.chunks) {
      let before = performance.now();
      const translated = await translator(chunk.text, { max_new_tokens: 384, num_beams: 1 });
      baselineMs += performance.now() - before;
      baseline += translated[0].translation_text.trim() + chunk.separator;
      const fast = await translator.tokenizer(chunk.text);
      tokenDifferences.push({ text: chunk.text, fast: fast.input_ids.tolist()[0].map(Number), reference: chunk.ids });
      before = performance.now();
      const output = await translator.model.generate({
        input_ids: new Tensor('int64', BigInt64Array.from(chunk.ids, BigInt), [1, chunk.ids.length]),
        attention_mask: new Tensor('int64', BigInt64Array.from(chunk.ids, () => 1n), [1, chunk.ids.length]),
        max_new_tokens: 384, num_beams: 1
      });
      referenceMs += performance.now() - before;
      generated.push({ ids: output.tolist()[0].map(Number), separator: chunk.separator });
    }
    results.push({ id: item.id, baseline: baseline.trim(), baselineMs: Math.round(baselineMs), referenceMs: Math.round(referenceMs), generated, tokenDifferences });
  }
  await fs.writeFile(`${directory}/onnx-results.json`, JSON.stringify({ warmMs, processRssMB: Math.round(process.memoryUsage().rss / 1048576), results }, null, 2));
  await translator.dispose();
})().catch(error => { console.error(error); process.exitCode = 1; });

const threadPort = require('node:worker_threads').parentPort;
const parentPort = threadPort || { postMessage: message => process.parentPort.postMessage(message), on: (_name, listener) => process.parentPort.on('message', event => listener(event.data)) };
const { translationChunks } = require('./translation-text.cjs');
let pipeline, stopping, current = null;
parentPort.on('message', async message => {
  if (message.type === 'cancel') { if (current === message.id) stopping?.interrupt(); return; }
  try {
    if (message.type === 'load') {
      const transformers = require('@huggingface/transformers');
      transformers.env.allowRemoteModels = false;
      transformers.env.useFSCache = false;
      transformers.env.useBrowserCache = false;
      stopping = new transformers.InterruptableStoppingCriteria();
      pipeline = await transformers.pipeline('translation', message.root, { device: 'cpu', dtype: 'q8', local_files_only: true, session_options: { intraOpNumThreads: message.threads, interOpNumThreads: 1, executionMode: 'sequential' } });
      // Warm generation, not just file loading, so the next lookup avoids first-run setup.
      await pipeline('你好。', { max_new_tokens: 32, num_beams: 1 });
      parentPort.postMessage({ type: 'loaded' });
    } else if (message.type === 'translate') {
      if (!pipeline || current !== null) throw new Error('Translation engine is not ready.');
      current = message.id; stopping.reset();
      const started = performance.now(), chunks = translationChunks(message.text);
      let output = '';
      for (const chunk of chunks) {
        if (stopping.interrupted) throw new Error('Translation canceled.');
        const tokens = await pipeline.tokenizer(chunk.text);
        if (tokens.input_ids.dims.at(-1) > 500) throw new Error('This sentence is too long for the offline model. Select a shorter sentence.');
        const translated = await pipeline(chunk.text, { max_new_tokens: 384, num_beams: 1, stopping_criteria: [stopping] });
        if (stopping.interrupted) throw new Error('Translation canceled.');
        const text = translated[0]?.translation_text?.trim();
        if (!text) throw new Error('The offline model returned no text.');
        output += text + chunk.separator;
      }
      parentPort.postMessage({ type: 'translated', id: message.id, text: output.trim(), elapsedMs: Math.round(performance.now() - started) });
      current = null;
    }
  } catch (error) {
    if (message.type === 'translate') current = null;
    parentPort.postMessage({ type: 'error', id: message.id, error: error.message });
  }
});

const path = require('node:path');
const { createWorker } = require('tesseract.js');
function createOcrWorker(dataRoot, cachePath) {
  // Node worker threads and WASM must use actual files outside Electron's ASAR.
  const workerPath = path.join(path.dirname(require.resolve('tesseract.js/package.json')), 'src', 'worker-script', 'node', 'index.js')
    .replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`);
  return createWorker(['chi_sim', 'chi_tra'], 1, { workerPath, langPath: dataRoot, gzip: false, cachePath });
}
module.exports = { createOcrWorker };

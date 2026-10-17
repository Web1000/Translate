// Explicit, checksum-verified install for proxy environments where Electron's
// Node downloader cannot use the supplied HTTPS route. Also prepares cross-builds.
const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
async function install(platform = process.platform) {
  const root = path.dirname(require.resolve('electron/package.json'));
  const version = require('electron/package.json').version;
  const name = `electron-v${version}-${platform}-x64.zip`;
  const cache = path.join(__dirname, '..', '.cache');
  const target = platform === process.platform ? path.join(root, 'dist') : path.join(cache, `electron-${platform}`);
  await fs.mkdir(cache, { recursive: true });
  const archive = path.join(cache, name);
  try { await fs.access(archive); }
  catch { execFileSync('curl', ['--fail', '--location', '--show-error', '--max-time', '240', '--output', `${archive}.tmp`, `https://github.com/electron/electron/releases/download/v${version}/${name}`], { stdio: 'inherit' }); await fs.rename(`${archive}.tmp`, archive); }
  const checksum = require('electron/checksums.json')[name];
  if (!checksum) throw new Error(`No official checksum for ${name}`);
  if (createHash('sha256').update(await fs.readFile(archive)).digest('hex') !== checksum) {
    await fs.rm(archive); throw new Error('Electron checksum mismatch; archive removed.');
  }
  await fs.mkdir(target, { recursive: true });
  await require('@electron-internal/extract-zip').extract(archive, { dir: target });
  if (platform === process.platform) await fs.writeFile(path.join(root, 'path.txt'), platform === 'win32' ? 'electron.exe' : 'electron');
  console.log(`Verified Electron ${version}: ${target}`);
}
install(process.argv[2]).catch(error => { console.error(error); process.exitCode = 1; });

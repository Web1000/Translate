const fs = require('node:fs/promises');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.join(__dirname, '..', 'resources');
const revision = '87416418657359cb625c412a48b6e1d6d41c29bd';
const checksums = {
  chi_sim: 'a5fcb6f0db1e1d6d8522f39db4e848f05984669172e584e8d76b6b3141e1f730',
  chi_tra: '529c5b5797d64b126065cd55f2bb4c7fd7b15790798091b1ff259941a829330b'
};
const hash = data => createHash('sha256').update(data).digest('hex');
async function download(name, url, checksum) {
  const target = path.join(root, name);
  try { if (hash(await fs.readFile(target)) === checksum) return console.log(`Verified: ${name}`); } catch {}
  console.log(`Downloading ${name}…`);
  // curl supports the cloud machine's HTTPS proxy and ships with Windows 10/11.
  let data = execFileSync('curl', ['--fail', '--location', '--silent', '--show-error', '--max-time', '120', url], { maxBuffer: 50000000 });
  if (data.length < 100000) throw new Error(`Incomplete asset: ${name}`);
  if (hash(data) !== checksum) throw new Error(`Checksum mismatch: ${name}`);
  await fs.writeFile(`${target}.tmp`, data);
  await fs.rename(`${target}.tmp`, target);
}
(async () => {
  await fs.mkdir(root, { recursive: true });
  for (const lang of ['chi_sim', 'chi_tra']) {
    await download(`${lang}.traineddata`, `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${revision}/${lang}.traineddata`, checksums[lang]);
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });

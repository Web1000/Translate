const canvas = document.getElementById('capture');
const ctx = canvas.getContext('2d');
const photo = new Image();
let start, end, ready = false, submitted = false;
function bounds() { return { x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) }; }
function draw() {
  if (!ready) return;
  ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0007'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (start && end) {
    const box = bounds();
    ctx.drawImage(photo, box.x, box.y, box.width || 1, box.height || 1, box.x, box.y, box.width || 1, box.height || 1);
    ctx.strokeStyle = '#70a8ff'; ctx.lineWidth = 2 * window.devicePixelRatio; ctx.strokeRect(box.x, box.y, box.width, box.height);
  }
}
function point(event) { const rect = canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(canvas.width, (event.clientX - rect.left) * canvas.width / rect.width)), y: Math.max(0, Math.min(canvas.height, (event.clientY - rect.top) * canvas.height / rect.height)) }; }
window.hanzi.onCapture(data => { photo.onload = () => { canvas.width = photo.width; canvas.height = photo.height; ready = true; draw(); }; photo.src = data; });
canvas.addEventListener('pointerdown', event => { if (!ready || submitted) return; start = end = point(event); canvas.setPointerCapture(event.pointerId); draw(); });
canvas.addEventListener('pointermove', event => { if (!start || submitted) return; end = point(event); draw(); });
canvas.addEventListener('pointerup', async event => {
  if (!start || submitted) return;
  end = point(event); const box = bounds();
  if (box.width < 8 || box.height < 8) { start = end = null; draw(); return; }
  submitted = true;
  const crop = document.createElement('canvas'); crop.width = Math.round(box.width); crop.height = Math.round(box.height);
  crop.getContext('2d').drawImage(photo, box.x, box.y, box.width, box.height, 0, 0, crop.width, crop.height);
  try { await window.hanzi.recognize(crop.toDataURL('image/png')); }
  catch { window.hanzi.cancelCapture(); }
});
window.addEventListener('keydown', event => { if (event.key === 'Escape') window.hanzi.cancelCapture(); });

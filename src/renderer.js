const $ = id => document.getElementById(id);
let settings, busy = false, activeRecording, shortcutDraft = {};
const friendly = shortcut => shortcut.replace('Control', 'Ctrl').replace('Super', 'Win').split('+').join(' + ');
const message = error => String(error?.message || error).replace(/^Error invoking remote method '[^']+': Error: /, '');
function render(value) {
  const shortcutsChanged = !settings || settings.selectionShortcut !== value.selectionShortcut || settings.captureShortcut !== value.captureShortcut;
  if (shortcutsChanged) shortcutDraft = { selectionShortcut: value.selectionShortcut, captureShortcut: value.captureShortcut };
  settings = value;
  for (const name of ['selectionEnabled', 'captureEnabled', 'toneColors', 'showPinyin']) $(name).checked = value[name];
  for (const name of ['fontSize', 'chineseStyle']) $(name).value = value[name];
  if (!activeRecording) for (const name of ['selectionShortcut', 'captureShortcut']) $(name).value = friendly(shortcutDraft[name]);
  $('selection-hint').textContent = `Shortcut  ${friendly(value.selectionShortcut)}`;
  $('capture-hint').textContent = `Shortcut  ${friendly(value.captureShortcut)}`;
  $('start-capture').disabled = !value.captureEnabled;
  $('dictionary-status').textContent = `${value.dictionaryEntries.toLocaleString()} entries · Simplified and Traditional`;
  $('key-state').textContent = value.hasKey ? 'A key is saved on this computer.' : 'No API key saved.';
  $('remove-key').disabled = !value.hasKey;
  $('app-version').textContent = `Version ${value.version}`;
  $('app-status').textContent = value.shortcutErrors.length ? `These shortcuts are in use: ${value.shortcutErrors.map(friendly).join(', ')}. Choose new combinations in Shortcuts.` : value.warning || '';
}
for (const button of document.querySelectorAll('[data-pane]')) button.addEventListener('click', () => {
  for (const pane of document.querySelectorAll('.pane')) pane.hidden = pane.id !== `pane-${button.dataset.pane}`;
  for (const nav of document.querySelectorAll('[data-pane]')) {
    nav.classList.toggle('active', nav === button);
    if (nav === button) nav.setAttribute('aria-current', 'page'); else nav.removeAttribute('aria-current');
  }
});
async function save(patch, statusId = 'app-status') {
  if (busy) return;
  busy = true;
  for (const control of document.querySelectorAll('.switch, select, #save-shortcuts')) control.disabled = true;
  try { render(await window.hanzi.saveSettings(patch)); if (statusId !== 'app-status') $(statusId).textContent = 'Saved.'; }
  catch (error) { render(settings); $(statusId).textContent = message(error); }
  finally { busy = false; for (const control of document.querySelectorAll('.switch, select, #save-shortcuts')) control.disabled = false; }
}
for (const name of ['selectionEnabled', 'captureEnabled', 'toneColors', 'showPinyin']) $(name).addEventListener('change', () => save({ [name]: $(name).checked }));
for (const name of ['fontSize', 'chineseStyle']) $(name).addEventListener('change', () => save({ [name]: $(name).value }));
for (const name of ['selectionShortcut', 'captureShortcut']) {
  const input = $(name);
  input.addEventListener('focus', async () => { activeRecording = name; input.classList.add('recording'); input.value = 'Press a shortcut…'; try { await window.hanzi.shortcutRecording(true); } catch (error) { $('shortcut-status').textContent = message(error); } });
  input.addEventListener('blur', () => { activeRecording = null; input.classList.remove('recording'); input.value = friendly(shortcutDraft[name]); window.hanzi.shortcutRecording(false).catch(error => { $('shortcut-status').textContent = message(error); }); });
  input.addEventListener('keydown', event => {
    if (event.key === 'Tab') return;
    event.preventDefault();
    if (event.key === 'Escape') { shortcutDraft[name] = settings[name]; input.value = friendly(settings[name]); input.blur(); return; }
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return;
    const special = { ' ': 'Space', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' };
    const key = special[event.key] || (event.code.startsWith('Key') ? event.code.slice(3) : event.code.startsWith('Digit') ? event.code.slice(5) : event.key);
    const modifiers = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Win'].filter(Boolean);
    input.value = [...modifiers, key.length === 1 ? key.toUpperCase() : key].join(' + ');
    shortcutDraft[name] = input.value.replace(/\s/g, '');
  });
}
$('save-shortcuts').addEventListener('click', () => save({ selectionShortcut: $('selectionShortcut').value.replace(/\s/g, ''), captureShortcut: $('captureShortcut').value.replace(/\s/g, '') }, 'shortcut-status'));
$('reset-shortcuts').addEventListener('click', () => { shortcutDraft = { selectionShortcut: 'Control+Shift+D', captureShortcut: 'Control+Shift+S' }; $('selectionShortcut').value = 'Ctrl + Shift + D'; $('captureShortcut').value = 'Ctrl + Shift + S'; $('shortcut-status').textContent = 'Click Save shortcuts to apply.'; });
$('start-capture').addEventListener('click', () => window.hanzi.capture().catch(error => { $('app-status').textContent = message(error); }));
$('key-form').addEventListener('submit', async event => { event.preventDefault(); if (!$('api-key').value.trim()) return; try { render(await window.hanzi.saveKey($('api-key').value)); $('api-key').value = ''; $('key-status').textContent = 'Key saved.'; } catch (error) { $('key-status').textContent = message(error); } });
$('remove-key').addEventListener('click', async () => { try { render(await window.hanzi.saveKey('')); $('api-key').value = ''; $('key-status').textContent = 'Key removed.'; } catch (error) { $('key-status').textContent = message(error); } });
$('quit-app').addEventListener('click', () => window.hanzi.quit());
window.hanzi.onSettings(render);
window.hanzi.settings().then(render).catch(error => { $('app-status').textContent = message(error); });

const defaults = Object.freeze({
  selectionEnabled: true, captureEnabled: true,
  selectionShortcut: 'Control+Shift+D', captureShortcut: 'Control+Shift+S',
  toneColors: true, showPinyin: true, fontSize: 'medium', chineseStyle: 'original'
});
function normalizeShortcut(value) {
  if (typeof value !== 'string' || value.length > 70) throw new Error('Choose a valid shortcut.');
  const parts = value.split('+').map(part => part.trim());
  const aliases = { ctrl: 'Control', control: 'Control', alt: 'Alt', shift: 'Shift', win: 'Super', meta: 'Super', super: 'Super' };
  const key = parts.pop();
  const modifiers = parts.map(part => aliases[part.toLowerCase()]);
  if (!modifiers.length || modifiers.some(part => !part) || new Set(modifiers).size !== modifiers.length || !modifiers.some(part => ['Control', 'Alt', 'Super'].includes(part))) throw new Error('Include Ctrl, Alt, or Windows in your shortcut.');
  const special = ['Space', 'Home', 'End', 'Insert', 'Delete', 'PageUp', 'PageDown', 'Up', 'Down', 'Left', 'Right'];
  const normalizedKey = /^[a-z0-9]$/i.test(key) || /^F([1-9]|1[0-9]|2[0-4])$/i.test(key) ? key.toUpperCase() : special.find(part => part.toLowerCase() === key.toLowerCase());
  if (!normalizedKey) throw new Error('Use a letter, number, function key, or navigation key.');
  return [...['Control', 'Alt', 'Shift', 'Super'].filter(part => modifiers.includes(part)), normalizedKey].join('+');
}
function validatePreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid settings.');
  if (Object.keys(value).some(key => !(key in defaults))) throw new Error('Unknown setting.');
  const result = { ...defaults, ...value };
  for (const name of ['selectionEnabled', 'captureEnabled', 'toneColors', 'showPinyin']) if (typeof result[name] !== 'boolean') throw new Error(`Invalid ${name} setting.`);
  for (const name of ['selectionShortcut', 'captureShortcut']) result[name] = normalizeShortcut(result[name]);
  if (result.selectionShortcut === result.captureShortcut) throw new Error('Choose a different shortcut for each feature.');
  if (!['small', 'medium', 'large'].includes(result.fontSize)) throw new Error('Invalid text size.');
  if (!['original', 'simplified', 'traditional'].includes(result.chineseStyle)) throw new Error('Invalid Chinese style.');
  return result;
}
function registerShortcuts(api, preferences, handlers) {
  const failures = [];
  api.unregisterAll();
  for (const feature of ['selection', 'capture']) {
    if (!preferences[`${feature}Enabled`]) continue;
    const shortcut = preferences[`${feature}Shortcut`];
    try { if (!api.register(shortcut, handlers[feature])) failures.push(shortcut); }
    catch { failures.push(shortcut); }
  }
  return failures;
}
module.exports = { defaults, normalizeShortcut, validatePreferences, registerShortcuts };

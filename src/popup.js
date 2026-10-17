const $ = id => document.getElementById(id);
let current;
function node(tag, className, text) { const result = document.createElement(tag); if (className) result.className = className; if (text !== undefined) result.textContent = text; return result; }
function message(error) { return String(error?.message || error).replace(/^Error invoking remote method '[^']+': Error: /, ''); }
function displayWord(token, entry, preference) { return preference === 'original' ? token.word : entry[preference]; }
function coloredWord(word, pinyin, className) {
  const wrapper = node('span', className);
  const syllables = pinyin.split(/\s+/), characters = [...word];
  characters.forEach((character, index) => wrapper.append(node('span', syllables.length === characters.length ? `tone-${window.pinyin.tone(syllables[index])}` : '', character)));
  return wrapper;
}
function pronunciation(pinyin, className) {
  const wrapper = node('span', className);
  for (const syllable of pinyin.split(/\s+/)) wrapper.append(node('span', `tone-${window.pinyin.tone(syllable)}`, `${window.pinyin.mark(syllable)} `));
  return wrapper;
}
function voices() { return window.speechSynthesis?.getVoices().filter(voice => /^zh(-|_)/i.test(voice.lang)) || []; }
function updateSpeech() { $('speak').disabled = !voices().length; $('speak').title = voices().length ? 'Read aloud' : 'Install a Chinese speech voice in Windows to read aloud'; }
function render(data) {
  if (current && data.id < current.id) return;
  const changed = !current || current.id !== data.id;
  if (changed) { window.speechSynthesis?.cancel(); $('action-status').textContent = ''; }
  current = data;
  const prefs = data.preferences;
  document.body.className = `size-${prefs.fontSize}${prefs.toneColors ? '' : ' no-tones'}${prefs.showPinyin ? '' : ' no-pinyin'}`;
  $('source-label').textContent = data.source === 'capture' ? 'Screen capture' : 'Text selection';
  $('result').hidden = data.status !== 'ready';
  $('error-actions').hidden = data.status !== 'error' || !prefs.captureEnabled;
  $('message').textContent = data.status === 'loading' ? 'Reading Chinese text…' : data.status === 'error' ? data.error : '';
  if (data.status !== 'ready') return;
  $('characters').replaceChildren(); $('definitions').replaceChildren();
  let matches = 0;
  for (const token of data.tokens) {
    if (!token.entries.length) {
      const visible = token.word.replace(/\p{Script=Latin}+/gu, '');
      if (visible.trim()) $('characters').append(node('span', 'raw-text', visible));
      if (/\p{Script=Han}/u.test(token.word)) $('definitions').append(node('div', 'unknown', `${visible} — not in the dictionary`));
      continue;
    }
    matches++;
    const first = token.entries[0];
    const word = displayWord(token, first, prefs.chineseStyle);
    const syllables = first.pinyin.split(/\s+/);
    const characters = [...word];
    const reading = node('span', 'reading-word');
    if (characters.length === syllables.length) {
      characters.forEach((character, index) => {
        const syllable = node('span', `syllable tone-${window.pinyin.tone(syllables[index])}`);
        syllable.append(node('span', 'hanzi', character), node('span', 'pronunciation', window.pinyin.mark(syllables[index]))); reading.append(syllable);
      });
    } else { reading.append(node('span', 'hanzi', word), pronunciation(first.pinyin, 'pronunciation')); }
    $('characters').append(reading);
    for (const entry of token.entries.slice(0, 1)) {
      const row = node('div', 'definition');
      const term = node('div', 'definition-term');
      term.append(coloredWord(displayWord(token, entry, prefs.chineseStyle), entry.pinyin, 'definition-hanzi'), pronunciation(entry.pinyin, 'definition-pinyin'));
      const meaning = node('div', 'meaning');
      const gloss = node('span', 'gloss', entry.definitions.slice(0, 3).join('; '));
      meaning.append(gloss);
      if (entry.definitions.length > 3) {
        const more = node('button', 'more', `+${entry.definitions.length - 3}`);
        more.setAttribute('aria-label', `Show all definitions for ${token.word}`);
        more.addEventListener('click', () => { gloss.textContent = entry.definitions.join('; '); more.remove(); });
        meaning.append(more);
      }
      if (token.entries.length > 1) {
        const alternatives = node('details', 'alternatives');
        alternatives.append(node('summary', '', `Other readings (${token.entries.length - 1})`));
        for (const other of token.entries.slice(1)) {
          const alternative = node('div', 'alternative');
          alternative.append(pronunciation(other.pinyin, 'definition-pinyin'), node('span', '', other.definitions.join('; ')));
          alternatives.append(alternative);
        }
        meaning.append(alternatives);
      }
      row.append(term, meaning);
      $('definitions').append(row);
    }
  }
  $('translation').textContent = data.translation || '';
  $('translation').hidden = !data.translation;
  const local = data.localTranslation || { installed: false, engine: 'idle' };
  $('sentence-status').textContent = data.translationStatus === 'loading' ? local.engine === 'loading' && data.translationSource === 'offline' ? 'Loading offline translation…' : 'Translating…' : data.translationStatus === 'error' ? data.translationError : data.translation ? 'On-device translation' : '';
  $('translation-settings').hidden = Boolean(local.installed && prefs.offlineTranslationEnabled);
  $('offline-retry').hidden = !(local.installed && prefs.offlineTranslationEnabled && data.translationStatus === 'error');
  $('lookup-note').textContent = matches ? 'Dictionary meanings' : 'No dictionary matches.';
  updateSpeech();
}
$('close').addEventListener('click', () => { window.speechSynthesis?.cancel(); window.hanzi.closePopup(); });
$('open-settings').addEventListener('click', () => window.hanzi.showSettings());
$('translation-settings').addEventListener('click', () => window.hanzi.showSettings());
$('offline-retry').addEventListener('click', () => window.hanzi.offlineTranslate(current.id).catch(error => { $('action-status').textContent = message(error); }));
$('retry-capture').addEventListener('click', () => window.hanzi.capture().catch(error => { $('message').textContent = message(error); }));
window.addEventListener('keydown', event => { if (event.key === 'Escape') { window.speechSynthesis?.cancel(); window.hanzi.closePopup(); } });
$('speak').addEventListener('click', () => {
  const available = voices(); if (!available.length) return;
  window.speechSynthesis.cancel();
  const speech = new SpeechSynthesisUtterance(current.text);
  const traditional = current.preferences.chineseStyle === 'traditional';
  speech.voice = available.find(voice => traditional ? /TW|HK/i.test(voice.lang) : /CN/i.test(voice.lang)) || available[0];
  speech.lang = speech.voice.lang; speech.rate = .85;
  speech.onerror = () => { $('action-status').textContent = 'The speech voice is unavailable. Check Windows speech settings.'; };
  window.speechSynthesis.speak(speech);
});
window.speechSynthesis?.addEventListener('voiceschanged', updateSpeech);
window.hanzi.onResult(render);
window.hanzi.result().then(render).catch(error => { $('message').textContent = message(error); });

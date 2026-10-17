const $ = id => document.getElementById(id);
let current, translating = false;
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
  if (changed) { window.speechSynthesis?.cancel(); translating = false; $('action-status').textContent = ''; }
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
      $('characters').append(node('span', 'raw-text', token.word));
      if (/\p{Script=Han}/u.test(token.word)) $('definitions').append(node('div', 'unknown', `${token.word} — not in the dictionary`));
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
    for (const entry of token.entries) {
      const row = node('div', 'definition');
      const term = node('div', 'definition-term');
      term.append(coloredWord(displayWord(token, entry, prefs.chineseStyle), entry.pinyin, 'definition-hanzi'), pronunciation(entry.pinyin, 'definition-pinyin'));
      const meaning = node('div', 'meaning', entry.definitions.slice(0, 3).join('; '));
      if (entry.definitions.length > 3) {
        const more = node('button', 'more', `+${entry.definitions.length - 3}`);
        more.setAttribute('aria-label', `Show all definitions for ${token.word}`);
        more.addEventListener('click', () => { meaning.textContent = entry.definitions.join('; '); });
        meaning.append(more);
      }
      row.append(term, meaning);
      $('definitions').append(row);
    }
  }
  $('translation').textContent = data.translation || '';
  $('translation').hidden = !data.translation;
  $('lookup-note').textContent = matches ? '' : 'No dictionary matches.';
  $('translate').hidden = !data.hasKey;
  $('translate').disabled = translating;
  $('translate').textContent = translating ? 'Translating…' : 'Translate sentence';
  $('translate').title = 'Send this text to OpenAI for English translation';
  updateSpeech();
}
$('close').addEventListener('click', () => { window.speechSynthesis?.cancel(); window.hanzi.closePopup(); });
$('open-settings').addEventListener('click', () => window.hanzi.showSettings());
$('retry-capture').addEventListener('click', () => window.hanzi.capture().catch(error => { $('message').textContent = message(error); }));
window.addEventListener('keydown', event => { if (event.key === 'Escape') { window.speechSynthesis?.cancel(); window.hanzi.closePopup(); } });
$('translate').addEventListener('click', async () => {
  const id = current.id; translating = true; $('translate').disabled = true; $('translate').textContent = 'Translating…'; $('action-status').textContent = '';
  try { await window.hanzi.translate(id); }
  catch (error) { if (current.id === id) $('action-status').textContent = message(error); }
  finally { if (current.id === id) { translating = false; $('translate').disabled = false; $('translate').textContent = 'Translate sentence'; } }
});
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

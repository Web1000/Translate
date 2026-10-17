const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('hanzi', {
  capture: () => ipcRenderer.invoke('capture'),
  recognize: data => ipcRenderer.invoke('recognize', data),
  cancelCapture: () => ipcRenderer.send('cancel-capture'),
  settings: () => ipcRenderer.invoke('settings'),
  saveSettings: patch => ipcRenderer.invoke('save-settings', patch),
  shortcutRecording: enabled => ipcRenderer.invoke('shortcut-recording', enabled),
  saveKey: key => ipcRenderer.invoke('save-key', key),
  translate: id => ipcRenderer.invoke('translate', id),
  offlineTranslate: id => ipcRenderer.invoke('offline-translate', id),
  installLanguagePack: () => ipcRenderer.invoke('install-language-pack'),
  cancelLanguagePack: () => ipcRenderer.invoke('cancel-language-pack'),
  removeLanguagePack: () => ipcRenderer.invoke('remove-language-pack'),
  result: () => ipcRenderer.invoke('get-result'),
  closePopup: () => ipcRenderer.send('close-popup'),
  showSettings: () => ipcRenderer.send('show-settings'),
  quit: () => ipcRenderer.send('quit'),
  onResult: callback => ipcRenderer.on('result', (_event, data) => callback(data)),
  onSettings: callback => ipcRenderer.on('settings-changed', (_event, data) => callback(data)),
  onCapture: callback => ipcRenderer.on('capture-image', (_event, data) => callback(data))
});

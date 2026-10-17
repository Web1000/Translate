# Hanzi Lens for Windows — 0.2.1

A background Chinese reading companion with compact lookup popups. Inspired by HanziKey; this is an independent project, not an official Windows port.

## Download from GitHub

Source: open [Web1000/Translate](https://github.com/Web1000/Translate), then **Code → Download ZIP**. Source downloads need the setup commands below; they do not include the compiled app or downloaded OCR models.

Windows app: open [Actions → Windows desktop](https://github.com/Web1000/Translate/actions/workflows/windows.yml), choose the latest run for `main`, and download **Hanzi-Lens-Windows-x64** under **Artifacts**. Sign in to GitHub if prompted. Extract the artifact ZIP, quit any older copy, and launch the EXE. The artifact appears after the **Upload Windows download** step completes. Windows-specific tests run afterward; check their results separately, as an uploaded build alone does not establish that those tests passed.

## Try the Windows app

Quit the previous version first (close its window or press Ctrl+C in the terminal that started it). Open `Hanzi Lens 0.2.1.exe` from `dist/`. It is portable and unsigned; no Node.js installation is needed to use the executable.

The main window contains **settings only**. Close it when you are done; Hanzi Lens keeps running in the system tray. Reopen Settings from the tray icon, or use its **Quit Hanzi Lens** menu item to stop the app and release its shortcuts.

- **Ctrl+Shift+D**: highlight Chinese text in another app and release the shortcut keys after pressing them. A small popup near the cursor shows tone-colored characters, pinyin, and English definitions. Settings is not opened or focused.
- **Ctrl+Shift+S**: drag a rectangle around Chinese text in an image, video, or app. Local OCR recognizes the text and sends the result to the same small popup. **Esc** cancels without reopening Settings.
- Close the popup with its × button. Drag the top bar to move it; resize it from a corner. Additional definitions expand through the small `+n` buttons.
- The speaker button uses an installed Chinese speech voice. It is disabled if Windows has no Chinese voice installed.

In Settings you can enable or disable each feature, change its shortcut, toggle tone colors and pinyin, choose text size, and prefer original, Simplified, or Traditional characters. Changes persist between launches. In **Shortcuts**, click the shortcut field, press the new combination, then **Save shortcuts**. Conflicts are reported and the previous settings remain active.

## Fixed in 0.2.1

Selected-text lookup now uses Electron 44's asynchronous `clipboard.read()`, `readText()`, `write()` and `ClipboardItem` APIs. This fixes the `clipboard.readHTML is not a function` error. A regression test now exercises selection reading and text/HTML restoration with the real Electron clipboard, substituting only the Windows helper process.

## What changed from 0.1

The large translation dashboard is gone. Selection and capture now share a separate compact dark popup. Settings uses plain dark panels and controls, with no translation text box. The app stays in the tray when Settings closes.

The Windows selection helper first reads the selected range through UI Automation. If that is unavailable, it uses native `SendInput` for Ctrl+C, waits for a clipboard change, and returns text over UTF-8 JSON. The app waits until selection reading completes before showing any popup. The old SendKeys/sentinel-clipboard flow has been removed. An empty selection or failure is explained in the popup rather than bringing up an empty main window.

The helper is launched with PowerShell `-EncodedCommand` to preserve command quoting. No PowerShell execution-policy change or administrator launch is required. Elevated apps and apps that block copying may still require screen capture.

## Sentence translation

English dictionary definitions work offline. Whole-sentence translation remains optional and online: add your own OpenAI API key under **Settings → Translation**, then use **Translate sentence** in the result popup. This sends the current text to OpenAI using `gpt-4.1-mini`; API usage may incur charges. Translation never runs automatically. Screenshots are not uploaded. Keys use the operating system's encrypted storage.

Hover lookup, automatic subtitle rescanning, and offline whole-sentence translation are not implemented.

## Run from source on Windows

Install Node.js 22 LTS (22.12+) or Node 24. The dictionary's package declares Node 22, so Node 24 prints an engine warning; its data has also been tested with Node 24. Open PowerShell in the extracted folder containing `package.json` and run:

```powershell
npm.cmd ci
npm.cmd run setup:electron
npm.cmd run assets
npm.cmd start
```

Use `npm.cmd` to avoid PowerShell's `npm.ps1` execution-policy restriction. The first install needs internet access. Subsequent dictionary lookup and OCR work offline. `setup:electron` verifies the pinned runtime against official SHA-256 checksums; `assets` verifies the bundled Chinese model checksums. Both commands are repeatable.

For an upgrade from an older source ZIP, extract this version into a new folder, quit the old process, and use the commands above in the new folder.

## Run the checks

```powershell
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:ui
npm.cmd run test:ocr
npm.cmd run test:electron
npm.cmd run test:windows
```

`test:windows` briefly opens a native test window, selects known Chinese text, and exercises the actual Windows selection helper in automatic and clipboard modes. Let that window keep focus until the test finishes. It runs only on Windows; Linux reports these checks as skipped. It does not use your own documents. The standard Electron test uses a separate temporary settings directory and does not change your saved settings.

Validation coverage:

- Unit tests: real dictionary entries in both scripts, segmentation, Unicode, pinyin, translation responses, shortcut validation, clipboard restoration and failure handling.
- Browser tests: settings-only UI, shortcut recording, feature toggles, popup contents, tone colors, and crop coordinates with DPI scaling.
- Electron integration: the actual shortcut handlers, popup-only success and failure paths, settings persistence and conflicts, cancellation, and screenshot → OCR → popup. Native selection, key registration, and screenshot sources are substituted in this test; these are not evidence of live Windows behavior.
- Real OCR smoke: a rendered Chinese image is read by the actual models and passed through the dictionary.

In Linux cloud tasks, use `CHROMIUM_PATH=/usr/bin/chromium` for the browser/OCR tests. The Electron integration test can use `ELECTRON_TEST_HEADLESS=1 ELECTRON_TEST_NO_SANDBOX=1` and writable `XDG_CONFIG_HOME` / `XDG_CACHE_HOME`. Those overrides apply only to the restricted test container; the shipped app keeps its sandbox. `ELECTRON_APP_PATH` can point the integration test at an unpacked build.

The Windows CI workflow includes the native checks and a portable build. It has not been run in this cloud task. Live Windows selection, tray behavior, global shortcuts, and monitor capture still need confirmation on a Windows desktop.

## Build

```powershell
npm.cmd run dist:win
```

For a Linux cross-build:

```sh
node scripts/install-electron.cjs win32
npm run dist:win -- --config.electronDist=.cache/electron-win32
```

The portable executable in `dist/` includes the dictionary, OCR workers/models, and Windows selection helper. It is unsigned; production signing is a separate release task.

## Privacy and limitations

Dictionary and OCR processing are local; no accounts or analytics. Screenshots are held in memory, not saved by the app. Selected-text lookup uses accessibility first; the copy fallback attempts to restore standard text/HTML/RTF/image clipboard formats when the clipboard has not changed again. Application-specific clipboard formats may not survive. Prefer capture if you need to keep such formats intact.

Dictionary segmentation uses longest matching words, not contextual language parsing. Polyphonic words can have several pronunciations, and tone colors reflect dictionary tones. OCR quality depends on size, contrast, and layout. Protected video may capture as black.

Settings and the encrypted translation key live in Electron's user-data folder, outside the source folder. There are no keys in the downloadable source. Data attribution and licenses: [resources/NOTICE.md](resources/NOTICE.md).

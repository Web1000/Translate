# Hanzi Lens — project handoff for Claude

This is a self-contained context document for continuing the project. You do not have the preceding conversation unless the user supplies it separately. Treat this as a snapshot, inspect the actual repository before editing, and distinguish existing implementation from proposals.

**Repository:** https://github.com/Web1000/Translate  
**Working product name:** Hanzi Lens  
**Version examined:** `0.3.0-beta.3`  
**Source snapshot examined:** `c98acaae9c07c6d616d23ced79ad8b2a8026c9c8`  
**Primary source branch:** `main`  
**Existing development branch:** `offline-translation`  
**Cloud checkout used for this handoff:** `/workspace/Translate` (not a folder automatically present on the user's PC).

## 1. User goals and constraints

Build an independent Windows Chinese-reading companion inspired by https://www.hanzikey.com/ . Support Simplified and Traditional Chinese → English, primarily text-selection lookup and screen capture.

The user has limited programming knowledge. Explain terms and practical steps plainly. Earlier Windows source work used PowerShell, Node 24, and a downloaded source folder. They may now be away from their Windows PC for roughly a month. Cloud development and automated Windows tests should reduce dependence on their machine, while remaining honest about manual desktop coverage.

Product requirements:

- Keep it completely free for end users. Do not restore the removed paid OpenAI feature or require a paid API key. Local inference is acceptable; any hosted alternative must actually satisfy the cost and availability constraints.
- **Ctrl+Shift+D:** read highlighted text from another app, then show only a compact popup near the cursor. Do not open/focus Settings first.
- **Ctrl+Shift+S:** draw a region on the current monitor, recognize Chinese, and use the same compact result popup.
- Settings is for switches, shortcuts, display, script preference, language-pack management, and app information. No large translation dashboard or typing area.
- Prefer a restrained, natural desktop interface. The user rejected the initial interface as looking too obviously AI-generated and supplied HanZiKey screenshots as inspiration.
- Dictionary rows should not repeat solely because a word has several readings/senses. Standalone Latin letters such as APP should not become Chinese dictionary entries.
- **Current priority: translation quality and accuracy.** Speed, RAM, CPU compatibility, and ease of use on ordinary users' PCs also matter. Do not promise universal near-instant performance.
- The user asked about copyright because the appearance/logo seemed too similar to HanZiKey. Original branding/asset clearance remains work; do not assume permission or assert a legal finding without an audit.

Collaboration lessons:

- A successful build or green CI does not establish good translation quality. Review actual outputs for meaning, clauses, negation, roles, numbers, and context.
- Do not ask the user to repeatedly download builds to compensate for missing basic verification.
- Do not give cloud filesystem paths or broken sandbox EXE links as Windows downloads. Use successful GitHub Actions artifacts.
- The user wanted **weekly development improvements**, not weekly tests of unchanged code. A test-only cron was added, then removed in `c98acaa`. **No recurring development or weekly test schedule is configured.** This cloud session had no recurring-Codex-task tool. Do not claim future autonomous work is scheduled or that GitHub test execution develops features.
- User authorization to push this project's routine changes was established in the preceding session. Still inspect current user instructions, working changes, and any environment-specific permissions before acting in your own session.

## 2. Implemented behavior

An Electron Windows app with a settings window, an always-on-top compact result popup, a capture overlay, and a system-tray menu. Closing Settings hides it; tray Quit stops the app. Single-instance locking means launching a second copy brings up existing Settings rather than intentionally starting another independent app.

Settings panes: Lookup, Display, Chinese style, Shortcuts, Translation, About. Defaults enable selection/capture, tone colors, and pinyin; medium text; original script; default shortcuts above. Offline sentence translation starts disabled. Installing a pack enables it. Shortcuts are validated, checked for conflicts, and rolled back if applying/saving new settings fails.

### Selection flow

`main.selectedText()` → `selection.readSelection()` → PowerShell helper → dictionary tokenization → `showResult()` → optional passage generation.

- Snapshot/materialize Electron clipboard items before invoking the helper.
- Execute `copy-selection.ps1` using PowerShell `-NoProfile -NonInteractive -STA -EncodedCommand`; encoding is UTF-16LE Base64, avoiding quoting problems.
- Helper waits for modifier release, reads Windows UI Automation TextPattern selection when available, otherwise sends native Ctrl+C via Win32 `SendInput` and watches clipboard sequence changes.
- App waits for selection retrieval before showing any popup, preserving source focus.
- Restore prior clipboard content if fallback succeeded and current plain text still equals the returned selection. Application-specific formats may not survive. Do not overwrite a newer user copy.
- Helper invocation has a 12-second production timeout; text is capped at 10,000 JS string characters. Errors offer screen capture rather than an empty Settings window.
- **Electron 44 clipboard APIs are asynchronous:** `clipboard.read()`, `readText()`, `write()` and `ClipboardItem`. Earlier `clipboard.readHTML is not a function` was a real bug. Do not reintroduce legacy synchronous clipboard assumptions.

### Capture/OCR flow

`captureAction()` → hide own windows → `desktopCapturer.getSources()` for monitor nearest cursor → overlay displaying a screenshot → canvas rectangle with coordinate scaling → cropped PNG IPC → Tesseract → shared dictionary/result path.

- Tesseract.js 7 with `tessdata_fast` `chi_sim` and `chi_tra` files.
- OCR worker starts lazily and is reused; actual recognition uses local files/WASM.
- The full monitor screenshot and crop are handled in memory; app code does not write capture files or upload images. Do not claim secure erasure or that the full monitor was never captured.
- Esc cancels the overlay without reopening Settings. Scaling math is covered by browser tests; all real monitor/DPI/protected-video scenarios are not verified.
- Image IPC validates PNG data URL and caps its string size. Recognized text is trimmed and sliced to 10,000 JS string characters before lookup.

### Dictionary and popup

`cedict-json@1.3.20251213` supplies CC-CEDICT. Startup indexes Traditional and Simplified spellings.

- Greedy longest matching dictionary entry from left to right. This is not contextual segmentation, POS parsing, or a trained word-sense selector.
- Match must contain at least one Han character, excluding standalone Latin A/P/APP slang entries from lookup. The popup also strips Latin characters from unmatched reading-strip text. Original input remains available to passage inference and speech.
- Merge entries with identical Traditional/Simplified/pinyin keys, deduplicating definitions.
- Ranking penalizes entries with only surname/variant/reference/classifier glosses, then archaic/obsolete/dialect-only senses, and favors entries with more ordinary glosses. This is a heuristic, **not measured frequency or contextual correctness**.
- One main row **per token occurrence**, with its first ranked entry. First three glosses display; `+n` expands more senses; “Other readings” preserves alternatives. Repeated occurrences in a sentence are not globally deduplicated.
- Pinyin numeric tones become marks; tone classes are displayed. Current colors: tone 1 red, 2 yellow, 3 green, 4 blue, 5 gray. These are dictionary tones, not full connected-speech/sandhi analysis.
- Script preference affects matched dictionary forms; unmatched text stays original.
- Browser `speechSynthesis` uses available Chinese voices, preferring CN or TW/HK according to the display preference. No custom online TTS endpoint. Voice availability and its platform implementation are separate from dictionary/model operation.

### Word versus passage guard

`isDictionaryLookup(tokens)` is true only when exactly one token has dictionary entries and every unmatched token consists of Unicode punctuation, separators, or whitespace. It can be a word or a fixed dictionary expression; it is not a character-count rule.

`showText()` stores `lookupMode`. `startOfflineTranslation()` centrally returns for word mode, including retry and settings-toggle paths. Recognized single entries never generate a sentence and do not need a language pack. Mixed/unknown/multiple-entry input remains eligible for passage handling. Popup labels word mode “Dictionary lookup” and hides sentence setup/retry controls.

Reason: raw OPUS generated **交际 / 交際 → “- No, no, no.”** CC-CEDICT correctly gives “communication; social intercourse.” Routing shields known lexical entries from this model error. It does not fix sentence translation.

## 3. Current sentence engine

There is **no paid translation integration, OpenAI key control, LibreTranslate URL, or online fallback** in the shipped app. The former `src/translation.cjs` was deleted. Startup removes the obsolete encrypted `translation-key` file from user data.

- Transformers.js **4.3.1**, ONNX Runtime native CPU backend, OpenCC-JS **1.4.2**.
- Model: **`Xenova/opus-mt-zh-en`**, int8/q8 ONNX Marian architecture.
- Pack ID: **`opus-zh-en-q8-v1`**.
- Verified pack: **119,499,668 bytes**.
- Verified conversion revision: **`39d480d52a9ea3065a1f117adfe4dbc55de10e6f`**.
- Verified declared source: **`Helsinki-NLP/opus-mt-zh-en`**, revision **`cf109095479db38d6df799875e34039d4938aaa6`**, **CC BY 4.0**.
- The product installer resolves current upstream metadata, then downloads at that immutable revision; the above verified revision is not a hardcoded universal product-install pin. Research scripts have explicit revision pins.
- Installer accepts declared Apache 2.0/CC BY 4.0, or the verified expected base model's accepted license if conversion metadata omits it. Keeps attribution, source model card where needed, hashes, sizes, and `pack.json` provenance.
- HTTPS curl downloads, bounded file/pack sizes (400 MiB product cap), checksum validation, temporary staging, backup/rename installation, cancellation. Never weaken TLS, hash, or license validation to make installation pass.
- Preferences and packs live outside source under Electron `app.getPath('userData')`: `preferences.json` and `translation-packs/opus-zh-en-q8-v1/`. Do not hardcode a guessed Windows app-data folder name.
- Model inference disables remote loading and filesystem/browser inference caches. Downloading initial weights needs network; translating installed input does not send passages to Hugging Face.

Runtime:

- `LocalTranslator` manages an isolated Electron utility process through `utilityWorker` (ordinary Node worker factory for non-Electron tests).
- At most two CPU inference threads; product chooses `max(1, min(2, available parallelism minus 1))`.
- Keep model loaded while enabled; warm with 你好。 before accepting work. Turning off stops the process and releases its resources; removing the pack separately reclaims disk.
- One active and at most one queued request. New intent cancels/replaces stale work. Main result IDs and request counters discard late results.
- Default model load/translation timeout is 90 seconds. Errors preserve access to Settings/dictionary where possible; do not claim immunity to all OS-level memory failures.
- Startup checks pack integrity asynchronously. A passage arriving during verification resumes after model readiness via `translatePendingPassage()`; this fixed an independently found startup gap.
- Model input: 1–2,000 Unicode code points. `translationChunks()` splits newlines/sentence punctuation and bounds pieces to roughly 160 code points, preferring nearby whitespace/commas/semicolons when splitting long pieces. Newline separators are retained. OpenCC converts Traditional → Simplified per chunk. Original result text is retained.
- Decimal points within numbers are not sentence boundaries. Do not restore the earlier `128.50` splitting bug.
- Reject chunks exceeding 500 input tokens. Product uses greedy decoding (`num_beams: 1`), max 384 new tokens per chunk, interruptible stopping criteria.
- Splitting can lose context. OCR soft line wraps may also fragment context; reflow is not currently implemented and should not be applied blindly to headings/paragraphs.
- App does not train itself, learn from user lookups, or automatically improve from failed tests.

## 4. Architecture and file map

| File(s) | Responsibility |
| --- | --- |
| `package.json`, `package-lock.json`, `.npmrc` | Exact dependencies, commands, packaging configuration; skip optional ONNX CUDA installation |
| `src/main.cjs` | Lifecycle, tray, windows, shortcut callbacks, trusted IPC, shared result state, pack/engine wiring |
| `src/preferences.cjs` | Defaults, shortcut validation/registration, settings validation |
| `src/preload.cjs` | Limited `window.hanzi` IPC bridge for renderer pages |
| `src/index.html`, `renderer.js`, `style.css`, `typography.css` | Settings-only interface, keyboard recorder, pack controls; system fonts |
| `src/popup.html`, `popup.js`, `popup.css`, `pinyin.js` | Result UI, dictionary grouping, readings/tones, sentence status, speech |
| `src/tray.png` | Icon used by tray/settings/window configuration; include in original-branding review |
| `src/capture.html`, `capture.js`, `capture.css` | Screenshot overlay, rectangle selection, pixel-coordinate crop |
| `src/selection.cjs`, `copy-selection.ps1` | Electron clipboard preservation, native Windows selection/copy helper |
| `src/dictionary.cjs`, `lookup-policy.cjs` | CC-CEDICT parsing/index/ranking/segmentation, dictionary-only guard |
| `src/ocr.cjs` | Local Tesseract worker and packaged file-path handling |
| `src/model-pack.cjs` | Verified model download/install/check/remove and provenance |
| `src/local-translator.cjs`, `utility-worker.cjs` | Engine lifecycle, process adapter, bounded queue and cancellation |
| `src/local-translation-worker.cjs`, `translation-text.cjs` | Actual local generation, OpenCC, input/chunk bounds |
| `scripts/download-assets.cjs`, `install-electron.cjs` | Pinned/checksummed OCR assets and Electron runtime setup |
| `scripts/translation-smoke.cjs`, `smoke-ocr.cjs` | Actual model/OCR functional checks |
| `scripts/evaluate-quality.cjs`, `prepare-evaluation.cjs`, `evaluate-onnx.cjs`, `evaluate-translation.py` | Research comparisons, not packaged alternative engines |
| `test/*.test.cjs` | Unit/logic regression tests |
| `test/ui.smoke.cjs`, `electron.smoke.cjs`, `windows-selection.native.cjs` | Browser, Electron, native Windows integration tests |
| `test/fixtures/translation-cases.json`, `translation-quality-cases.json` | 30 baseline plus 24 additional diagnostic meanings |
| `.github/workflows/windows.yml` | Windows tests, packaging, artifact gating, source-bound validation reports |
| `.github/workflows/translation-evaluation.yml`, `translation-quality.yml` | Separate actual-engine research jobs |
| `.github/workflows/model-discovery.yml` | Model metadata and bounded recent Actions job-state inspection |
| `resources/NOTICE.md` | Dictionary, OCR, model/runtime attribution and licenses |
| `VALIDATION.md`, `docs/translation-evaluation.md`, `docs/translation-quality.md` and `*-results.json` | Historical evidence, methodology, raw outputs, caveats |
| `docs/app-explained.md` | Beginner-facing explanation |

Renderer security: `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`; preload exposes specific operations; main validates IPC sender and main frame; external navigation/window creation is denied; local CSP; dictionary/result text uses `textContent`. Preserve these boundaries. They are safeguards, not a completed security audit or signing certificate.

Electron **44.8.0**, electron-builder **26.15.3**, Playwright **1.64.1**, Tesseract.js **7.0.0**, dictionary package **1.3.20251213** are pinned at this snapshot. JavaScript/CommonJS backend plus plain HTML/CSS/browser JS; no React app, web backend, account service, or database server.

## 5. Setup and distribution

Node requirement: **22.12+**; Windows CI uses Node 22. Node 24 has been used successfully, with an engine warning because `cedict-json` declares Node 22.

In a Windows source folder containing `package.json`:

```powershell
npm.cmd ci
npm.cmd run setup:electron
npm.cmd run assets
npm.cmd start
```

Use `npm.cmd` to avoid the user's PowerShell `npm.ps1` execution-policy restriction. No administrator launch or system policy change should be necessary. First setup downloads dependencies, Electron, and Chinese OCR assets. Quit older tray copies before testing a new version. Settings close alone does not quit.

Packaged use: download **Hanzi-Lens-Windows-x64** from a complete successful **Windows desktop** run for `main`, extract, launch the portable EXE. Users do not need source, Node, VS Code, or Python. Sentence weights are installed separately through Settings. The EXE is currently unsigned. There is no implemented app auto-updater.

Build on Windows:

```powershell
npm.cmd run dist:win
```

Use Windows for releases: `onnxruntime-node` has platform-specific native dependencies. A Linux cross-build is not the supported shipping path. electron-builder bundles app code and runtime, dictionary, OCR assets, helper and license resources; unpacks Node dependencies and worker-related files from ASAR so native/WASM/utility processes can access actual files. Research models/Python packages are not bundled. `dist/` and downloaded caches/assets are ignored outputs, not source.

Cloud caveats: this conversation's host is Linux; it cannot directly reproduce every Windows desktop interaction. Network policy can change. Earlier Hugging Face/Argos downloads were blocked here, while Windows Actions could fetch them. Inspect current supported runtime/network settings rather than assuming old access remains blocked or silently bypassing restrictions. Existing Git HTTPS authentication may be platform-injected even without `GH_TOKEN`; do not extract credentials or ask for a token until the required operation is actually tested.

## 6. Tests: what passed and what is not proven

Latest Windows main report actually checked for this handoff:

- **Commit:** `c98acaae9c07c6d616d23ced79ad8b2a8026c9c8`.
- **Run:** https://github.com/Web1000/Translate/actions/runs/39155612138 .
- Real translation, portable build, source Electron, packaged Electron, native selection, and artifact upload all reported **success**. The workflow gates upload behind unit, UI, OCR, real model, integration and native checks. This is evidence for that revision, not future revisions or universal translation correctness.

Commands after setup:

```powershell
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:ui
npm.cmd run test:ocr
npm.cmd run test:electron
npm.cmd run test:windows
npm.cmd run test:translation -- --install
```

Important limits:

- Unit/controller/pack tests include synthetic data and fake workers; they validate logic rather than real model quality.
- Electron test uses real Electron clipboard APIs, actual OCR and, when `ELECTRON_TEST_LANGUAGE_PACK` is set, actual model weights. It substitutes shortcut registration, the native selection invocation, monitor geometry/screenshot sources. It invokes the same app callbacks; it is not a complete physical-hotkey/desktop test.
- Native Windows fixtures separately exercise the real helper against a selected test control in automatic and clipboard modes. They are skipped on Linux. They do not cover every browser/game/elevated window.
- Word-mode regression spies on generation and asserts zero model calls for 交际/交際, including retry and enable/disable paths with the real pack present.
- Packaged integration uses `ELECTRON_APP_PATH=.../dist/win-unpacked/Hanzi Lens.exe`, in temporary user data. Test overrides are not production settings.
- A handful of correct greetings does not establish contextual meaning quality. Use real Chinese plus curated diagnostics, inspect omissions/roles/negation/numbers, and seek competent bilingual review for release confidence.

Linux test overrides, when dependencies/system Chromium are available:

```bash
CHROMIUM_PATH=/usr/bin/chromium npm run test:ui
CHROMIUM_PATH=/usr/bin/chromium npm run test:ocr
XDG_CONFIG_HOME=/workspace/Translate/.cache/config XDG_CACHE_HOME=/workspace/Translate/.cache ELECTRON_TEST_HEADLESS=1 ELECTRON_TEST_NO_SANDBOX=1 npm run test:electron
```

Use a writable npm cache if required by the host (`npm --cache /workspace/.npm-cache ...`). The no-sandbox/headless flags are restricted-cloud test workarounds only; retain the shipped app's sandbox.

CI has no weekly cron. Relevant code pushes/PRs/manual dispatch run Windows checks. Push ignores docs/README/validation and specified research-only paths; PR/manual behavior is defined in the workflow. Same-branch newer desktop runs cancel superseded ones; canceled is not passed. Do not disable assertions or ignore failures to produce an artifact.

Cloud inspection through Git when private GitHub API access is unavailable:

```bash
git fetch origin refs/heads/codex-validation-main:refs/remotes/origin/codex-validation-main
git show refs/remotes/origin/codex-validation-main:validation-report.json
```

Compare `commit`, outcomes, and `run_url` with the revision under discussion. Feature reports use `codex-validation-offline-translation`. Research branches use `codex-validation-translation-evaluation` and `codex-validation-quality-{opus,m2m100,madlad}`. Metadata/job snapshots use `codex-validation-model-discovery` with `model-metadata.json` and `ci-runs.json`. These are generated diagnostic branches, not source/release branches. Their reports can be stale or replaced out of order. Never force-push `main` using the generated-report recipe.

## 7. Translation research already completed

Read the reports before proposing that we “just use LibreTranslate” or “just increase beams.”

### 30-case OPUS/reference-tokenizer/Argos comparison

Run https://github.com/Web1000/Translate/actions/runs/39082897658 at `664f2e4`. See `docs/translation-evaluation.md` and its raw JSON.

- Current OPUS fast-tokenizer path versus **same ONNX weights/generation with verified original Python MarianTokenizer**. This reproduced the word hallucination and key negation errors. Some mixed Latin/numeric encodings differed; no general semantic cure was shown.
- Argos Chinese→English **1.9**, SentencePiece/CTranslate2 **4.6.0** int8 backend, beam 4, length penalty 0.2, replace unknowns. It is a model-backend comparison, **not a hosted LibreTranslate endpoint or its sentence-boundary detector**.
- Argos fixed 交际 but dropped clauses, reversed the tested double negation, and produced “Could not close temporary folder: %s” for the Traditional network-settings sentence.
- Kept out of the app. Official Argos download protocol uses its documented `ArgosTranslate` user agent; a generic client initially returned 403. TLS/checksum checks were not disabled.

### 54-case larger-model comparison

Run https://github.com/Web1000/Translate/actions/runs/39139047323 at **`97690ee347fc91cecf038dea2a5a13ed44191a15`**. See `docs/translation-quality.md` and `translation-quality-results.json`.

All three exact conversions completed the same 54 diagnostics, with OpenCC/app chunking, two CPU inference threads, q8, greedy decoding, max 256 new output tokens. Four multi-chunk inputs also tested whole-context input. Five isolated-word cases intentionally diagnose raw engines even though production word mode bypasses generation.

| Tested conversion | License | Research download | Warm/load | Median non-word primary case | Max sampled process RSS |
| --- | --- | ---: | ---: | ---: | ---: |
| Xenova/opus-mt-zh-en | CC BY 4.0 | 121 MB | 1.03 s | 0.26 s | 605 MiB |
| Xenova/m2m100_418M | MIT | 644 MB | 2.95 s | 1.12 s | 2,488 MiB |
| Kutalia/madlad400-3b-mt-onnx | Apache 2.0 | 3.22 GB | 23.75 s | 1.88 s | 3,963 MiB |

Separate Windows x64 runners had about 8 GiB RAM and different AMD EPYC CPUs. No controlled speed-ratio claim; process RSS samples are not total Electron memory or instantaneous peaks. OPUS research download includes extra JSON files beyond the installed product pack. M2M100's repeated wrong amount took about 26.93 seconds. Research median is across 49 non-word primary cases, excluding whole-context extra calls.

M2M100 still reversed negation, translated peanuts as flowers, and looped on a number. MADLAD fixed some examples but still reversed the original negation, omitted the child-care clause, invented an unrelated refund instruction, and turned a casual reply into “No, no, no, no, no.” Whole-context MADLAD controls included repetitive numbers/symbols and repetitive Chinese output. Whole-paragraph context helped the bank-card pronouns but hurt other inputs.

**Neither replacement was shipped.** Results apply to these conversions/runtime/quantization/decoder settings, not every possible original-model implementation. The fixtures are curated diagnostic meanings, not an independent representative quality score. Successful execution is not semantic success.

At the tested Transformers.js version, true beam search for these models is not implemented: do not assume setting `num_beams: 4` actually supplies it. A stronger original/reference implementation, different quantization, or properly supported decoder needs its own controlled comparison.

## 8. Important history and unresolved work

Already fixed:

- Large translator dashboard replaced by settings-only app and compact popup.
- Selection focus ordering/native helper flow and async Electron clipboard compatibility.
- Duplicate dictionary rows and standalone Latin dictionary lookups.
- Paid key/service UI, IPC, and handler removed; legacy key cleanup added.
- Known single entries shielded from sentence hallucination.
- Decimal boundaries retained, stale inference canceled, pending startup passage resumed.
- Artifact upload moved after all required checks.

Earlier CI failures were real. Seven historical failures comprised four capture-Escape/CDP renderer-closure races, two model-license verification problems, and one native-fixture cold-start timeout at 22 seconds. Fixes preserved assertions: Escape is sent from the surviving Electron main process, and the native fixture's outer budget is now 40 seconds with its internal helper deadline retained. Production selection timeout stayed 12 seconds. Historical red runs remain red; a rerun or separate green test does not retroactively make them passed.

Unresolved:

1. Passage translation quality remains poor in meaningful cases. Need genuinely stronger free implementation, reviewed outputs, and measured CPU/package compatibility.
2. Dictionary segmentation, reading choice, and sense ordering lack contextual parsing/disambiguation. A selected isolated word does not supply surrounding context by magic.
3. Everyday Windows shortcut/tray/clipboard/protected-content/multimonitor behavior needs broader desktop coverage.
4. OCR errors, layouts, and line-wrap context need investigation rather than attributing all failures to the sentence engine.
5. Original branding/assets, app signing, and release preparation remain unfinished. No hover mode, live subtitle rescanning, or auto-updater.
6. No autonomous weekly development task is configured. Do not re-add test-only cron as a substitute.

## 9. Licensing and privacy context

CC-CEDICT data is **CC BY-SA 4.0**, not the model's CC BY 4.0. Tesseract/its OCR data and Transformers.js use Apache 2.0; ONNX Runtime uses MIT; OpenCC-JS includes MIT/Apache terms. Keep attribution and applicable notices; changing a dependency/model requires reviewing its actual redistribution terms. Do not infer that a free download permits all commercial redistribution. No root app-code LICENSE appears in the inspected source tree; decide the app's licensing before public distribution. `private: true` in package.json prevents npm publication; it does not establish GitHub visibility or branding rights.

The app has no built-in account, analytics system, screenshot-upload service, or paid text endpoint. Dictionary/OCR/model inference are local after setup. Optional speech uses platform-exposed voices; do not extend local-model claims into an unverified guarantee about every voice implementation. Settings, caches, and weights do exist on disk. Clipboard restoration has the limitations above. These are code observations, not a complete security/privacy audit.

## 10. How to continue productively

Start by checking current `main`, user changes, these source files, and the latest source-bound Windows report. Preserve working selection, popup, and word-only behavior while improving accuracy. Reproduce a concrete failure and identify which stage causes it before replacing a component.

For a proposed engine/segmentation/context change, review real examples plus both fixture sets, record severe regressions as well as improvements, verify Simplified/Traditional and mixed Latin/numeric inputs, measure CPU/RAM/download/startup costs, check licenses, and exercise the actual packaged Windows app. Treat benchmark timings as measurements for the stated machine. Do not claim a handful of examples proves general accuracy or all-PC readiness.

When updating the user, lead with what changed and what evidence supports it, explain practical limitations, and state what remains unresolved. Do not promise future unattended work without a functioning recurring coding-task mechanism. Keep this handoff updated when implementation or priorities materially change.

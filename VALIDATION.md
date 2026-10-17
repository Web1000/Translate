# Offline translation beta: 0.3.0-beta.1

Verified implementation: `55e3db2`. Later changes record results and add CI diagnostics.

| Check | Observed result |
| --- | --- |
| Dictionary, clipboard, preferences, translation chunks/controller, pack integrity and license provenance | 24 unit tests passed |
| Settings, popup, language-pack controls, stale results and crop UI | 4 browser tests passed |
| Actual OCR → dictionary | Passed in the Linux cloud workspace and Windows workflow |
| Real Simplified/Traditional CPU translation | Four known sentences passed on Windows |
| Source Electron with the real language pack | Passed on Windows |
| Packaged Windows EXE with the real language pack | Passed on Windows |
| Native Windows selection helper, automatic and clipboard fallback | Both passed in a separate Windows run; an earlier combined run failed |
| Production dependency audit | 0 known vulnerabilities reported at implementation time |

[Windows build and real-model integration report](https://github.com/Web1000/Translate/actions/runs/39043906817). Its artifact contains the portable EXE and benchmark JSON. The run failed only at the subsequent native selection step; it is not an all-green run. [Separate native selection run](https://github.com/Web1000/Translate/actions/runs/39044622825) passed both tests against the same selection-helper code. An earlier source Electron check also failed before a rerun passed. These intermittent results remain a reliability limitation; live shortcut, tray and monitor behavior should be checked on the user's Windows desktop.

The installer tests use synthetic fixtures; those alone do not establish translation quality. Real-model checks separately translated “Hello, world,” “I like learning Chinese” from both scripts, and a nearest-train-station question. The Electron tests exercise real clipboard APIs and real offline translation; they substitute native selection, shortcut registration, and screenshot sources. Separate native tests exercise the actual PowerShell helper with a selected Windows text control.

Windows CPU benchmark: Node 22.23.3, Windows x64, two available CPUs, two inference threads. Latest run: **1,847 ms** to load and warm, **115–315 ms** for the four short sentences, **547 MB** benchmark-process RSS. An earlier run measured 4,906 ms warm-up and 104–244 ms generation. Memory excludes the Electron app's additional overhead. Minimum RAM and performance on older PCs are not established.

The verified language pack is 119,499,668 bytes. Conversion: `Xenova/opus-mt-zh-en`, revision `39d480d52a9ea3065a1f117adfe4dbc55de10e6f`. Declared source: `Helsinki-NLP/opus-mt-zh-en`, revision `cf109095479db38d6df799875e34039d4938aaa6`, CC BY 4.0. The installer retains attribution and verifies immutable revisions, sizes and checksums. Inference disables remote model access.

The cloud machine blocks Hugging Face, so the real-model download and Windows checks ran in GitHub Actions. The generated validation branches record tested commits, outcomes and bounded logs; model weights are not stored in Git.

## CI failure investigation

The seven failed desktop runs before the correction comprised four Escape/CDP target-closure races, two earlier model-license verification failures, and one native fixture timeout at 22 seconds. Historical runs remain failed; separate passing tests did not make those runs successful.

The capture test now sends the native Escape event from Electron's surviving main process and still requires the capture window to close and all app windows to remain hidden. It no longer awaits a CDP reply from the renderer that Escape destroys. The native fixture retains its internal 15-second helper deadline; the outer process budget is 40 seconds to include cold Windows/PowerShell startup and cleanup. The production selection helper timeout is unchanged.

The download upload now follows all required tests. There are no automatic test retries or ignored failures. Current results must be read from a complete successful Windows workflow run, not inferred from separate passing reruns. Generated reports record the exact source commit for both main and the feature branch.

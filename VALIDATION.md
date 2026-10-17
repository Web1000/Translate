# Offline translation candidate: 0.3.0-beta.1

Observed in the Linux cloud workspace:

| Check | Result |
| --- | --- |
| Dictionary, clipboard, preferences, translation text/worker control, pack integrity tests | 23 passed |
| Settings, popup, language-pack controls, stale results, and crop browser tests | 4 passed |
| Electron lookup/capture integration and isolated native-runtime import/error handling | Passed |
| Real OCR → dictionary smoke | Passed in the previous version; OCR code is unchanged |
| Production dependency audit | 0 known vulnerabilities reported |
| Native Windows selection tests | Not run here |
| Real model download, translation quality, memory, and latency | Pending Windows CI; Hugging Face is blocked in this cloud machine |

The unit installer tests use synthetic fixtures and do not establish model quality. The engine-control tests substitute a worker; the Electron integration loads the actual native runtime in an isolated utility process and confirms missing models fail without a main-app crash. None of these is a passing real-model translation test.

The Windows workflow downloads and verifies the real pack, runs known Simplified/Traditional translations and timing checks, builds the app, and tests actual offline translation in both source and packaged Electron. Only after those checks pass does it upload the Windows candidate and its benchmark report. Native Windows text-selection checks run afterward. A feature-branch report records individual outcomes and the tested source commit.

Minimum RAM and performance on older PCs are not established. CI measurements apply only to the reported CI machine. No near-instant claim is made for all hardware.

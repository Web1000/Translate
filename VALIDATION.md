# Offline translation candidate: 0.3.0-beta.1

Observed in the Linux cloud workspace:

| Check | Result |
| --- | --- |
| Dictionary, clipboard, preferences, translation text/worker control, pack integrity tests | 24 passed |
| Settings, popup, language-pack controls, stale results, and crop browser tests | 4 passed |
| Electron lookup/capture integration and isolated native-runtime import/error handling | Passed |
| Real OCR → dictionary smoke | Passed |
| Production dependency audit | 0 known vulnerabilities reported |
| Native Windows selection tests | Failed in Windows CI; investigating separately |
| Real model download and four sentence checks | Passed on Windows CI |
| Windows source / packaged Electron with the real pack | Both passed |

The unit installer tests use synthetic fixtures and do not establish model quality. The engine-control tests substitute a worker; the Electron integration loads the actual native runtime in an isolated utility process and confirms missing models fail without a main-app crash. Those isolated checks alone do not establish actual translation quality. Separately, Windows CI passed four real-model cases: hello world, Simplified and Traditional “I like learning Chinese,” and a nearest-train-station question.

The Windows workflow downloads and verifies the real pack, runs known Simplified/Traditional translations and timing checks, builds the app, and tests actual offline translation in both source and packaged Electron. Only after those checks pass does it upload the Windows candidate and its benchmark report. Native Windows text-selection checks run afterward. A feature-branch report records individual outcomes and the tested source commit.

Minimum RAM and performance on older PCs are not established. CI measurements apply only to the reported CI machine. No near-instant claim is made for all hardware.

Windows CI CPU measurements (Node 22.23.3, two available CPUs, two inference threads): 4,906 ms to load and warm; 104–244 ms for the four short sentences; 538 MB benchmark-process RSS. These exclude the Electron app’s additional memory. Model revision: `39d480d52a9ea3065a1f117adfe4dbc55de10e6f`, source license CC BY 4.0.

Verified Windows build and artifact: https://github.com/Web1000/Translate/actions/runs/39043906817 (source commit `55e3db2`). Both Electron tests exercised the real language pack. The separate native selection check failed after upload; this run is not an all-green release. Latest benchmark: 1,847 ms warm-up, 115–315 ms short sentences, 547 MB benchmark-process RSS, 119,499,668-byte language pack.

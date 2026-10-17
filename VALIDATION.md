# Version 0.2.0 validation

Validated in the Linux cloud workspace:

| Check | Result |
| --- | --- |
| Dictionary, pinyin, preferences, selection adapter, and translation unit tests | 15 passed |
| Settings, popup, and crop browser tests | 3 passed |
| Electron integration against the packaged application | 1 passed |
| Actual OCR → dictionary smoke | Passed for Simplified and Traditional Chinese |
| Native Windows selection helper tests | 2 skipped — requires Windows |

The packaged Electron integration invokes the same handlers as the registered shortcuts and verifies that Settings stays hidden for selection, capture, failures, and cancellation. It also checks saving settings, restoring them after restart, disabled shortcuts, and rolling back a conflicting shortcut. The OS selection result, global key registration, display geometry, and screenshot source are substituted in that test. OCR, popup rendering, IPC, and settings persistence run through real code.

A Windows portable executable was cross-built. Native Windows execution, system-tray behavior, actual keyboard/clipboard access, multiple monitors, and installed speech voices still require Windows testing. Live OpenAI translation was not called; only its request/response handling was tested.

Run `npm.cmd run test:windows` on Windows to open a known-text fixture and test the actual helper's automatic and native Ctrl+C modes. See README.md for setup and the complete test commands. The bundled Windows CI workflow has not been run in this cloud task.

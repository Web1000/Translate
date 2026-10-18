# Offline Chinese–English translation evaluation

[Completed Windows comparison](https://github.com/Web1000/Translate/actions/runs/39082897658), tested source commit `664f2e4`. [Raw outputs, timings, versions and model provenance](translation-evaluation-results.json).

The 30 diagnostic cases cover isolated words, short phrases, Simplified/Traditional pairs, negation, social interaction, child care, mixed APP text, a monetary amount, an interface message, idioms, and a short paragraph. The English references describe intended meaning. They are not the only valid wording, and no exact-match or broad quality percentage is claimed.

Compared on CPU with two inference threads:

- App baseline: verified `Xenova/opus-mt-zh-en` ONNX int8 weights, Transformers.js 4.3.1, greedy decoding.
- Reference-tokenizer control: the same ONNX weights/generation with Python Transformers 4.57.1 MarianTokenizer using verified source.spm, target.spm and vocab.json from the same immutable model revision. This isolates tokenization from model inference.
- Argos Chinese→English package 1.9: SentencePiece 0.2.1 and CTranslate2 4.6.0 int8 backend, beam size 4, length penalty 0.2 and unknown replacement matching Argos settings. This tests the model backend used by LibreTranslate, not a hosted LibreTranslate endpoint or its sentence-boundary detector.

All paths use the app's same OpenCC normalization and chunks. Original text remains in the popup. Different decoder settings affect both quality and speed. Reference-tokenizer timing excludes Python encoding/decoding. The raw process-memory figures include different runtime overheads and are not whole-app measurements.

## Selected findings

| Input and intended meaning | App baseline | Argos backend |
| --- | --- | --- |
| 交际 — communication / social interaction | “- No, no, no.” | “Communication” |
| 我不是不想去，只是今天没有时间。 — It is not that I do not want to go; I have no time today. | “I don't want to go, just don't have time for this.” | “I don't want to go, just no time today.” |
| 不好意思，我刚才没看到你的消息。 — Sorry, I did not see your message earlier. | “Sorry, I didn't hear from you.” | “Sorry, I didn't see your message.” |
| 请帮我看一下孩子，我去拿个快递。 — Watch the child while I collect a delivery. | “Please, check the kids out. I'll get a delivery.” | “I'll get a delivery.” |
| 無法連線，請檢查網路設定後再試一次。 — Unable to connect; check network settings and retry. | “If you cannot connect, check the network setup and try again.” | “Could not close temporary folder: %s” |

Reference Marian tokenization reproduced the isolated-word and negation failures. Encoding differed on three mixed Latin/numeric chunks and changed a few outputs, but did not resolve the main semantic failures. The incomplete-tokenizer warning is real; it does not explain away these observed model errors.

Argos improves some cases and degrades others, including severe omissions and unrelated interface text. These results do not justify making it the default quality upgrade. Its model README identifies it as derived from OPUS-MT, with CC BY 4.0 licensing. The package download is 74,481,402 bytes; its SHA-256, index hash and full metadata are in the raw report. An initial generic Python download was rejected with HTTP 403; the documented upstream `ArgosTranslate` user agent worked. TLS verification was retained.

## Release decision

Keep Argos out of the release. Recognized dictionary words now skip generation entirely, including retry/settings paths; 交际 and 交際 show the CC-CEDICT definitions “communication; social intercourse.” Decimal points are preserved inside numbers. These are deterministic fixes, not a claim that OPUS sentence translation is now contextually reliable.

The current passage model remains limited. Replacing it with a larger permissively licensed local model needs a separate comparison of meaning preservation, CPU latency, memory and redistribution terms. No model can guarantee correct meanings, and a handful of passing greetings is insufficient quality evidence.

The [subsequent 54-case Windows study](translation-quality.md) tested M2M100 and MADLAD int8 conversions, including larger-model costs and whole-passage controls. Both introduced serious regressions and were kept out of the app.

## Reproduce the research

On Windows with Node 22 and Python 3.11:

```powershell
npm.cmd ci
python -m pip install ctranslate2==4.6.0 sentencepiece==0.2.1 transformers==4.57.1 sacremoses==0.1.1 psutil==7.0.0
node scripts/prepare-evaluation.cjs
python scripts/evaluate-translation.py
```

Results are written to `.cache/translation-evaluation/report.json`. Internet access is needed for the initial verified model/tokenizer/package downloads. Python and these research packages are not required to run the Windows app. Word cases intentionally exercise raw engines for diagnosis; the released app routes recognized words to the dictionary instead.

# Larger free translation models: Windows evaluation

The tested M2M100 and MADLAD conversions do not justify replacing the current OPUS engine. Both fix some examples but introduce serious meaning errors. MADLAD also costs substantially more memory and download space. No new engine has been added to the app.

[Windows research run](https://github.com/Web1000/Translate/actions/runs/39139047323) · source commit `97690ee347fc91cecf038dea2a5a13ed44191a15` · [all raw outputs, file checksums, model revisions, and machine details](translation-quality-results.json).

## Method

Each engine completed the same 54 manually authored cases: the [original 30](../test/fixtures/translation-cases.json) plus [24 further cases](../test/fixtures/translation-quality-cases.json). The added cases probe willingness/negation, borrowing/lending, amounts, restrictions, dates, casual messages, mixed Latin names, Traditional Chinese, and paragraphs. English references describe intended meaning rather than requiring one exact wording. This is a diagnostic comparison, not a representative accuracy percentage or an automatic semantic pass.

All three use Transformers.js 4.3.1, ONNX Runtime CPU, two inference threads, int8 weights, greedy decoding, and a 256-token output limit. This is the backend available in the app. Transformers.js currently does not implement genuine beam search for these models; changing `num_beams` alone is not a beam-search quality upgrade. Results should not be generalized to the original models in other runtimes, precisions, or decoder settings.

Primary outputs use the app's identical OpenCC normalization and bounded sentence chunks. Four inputs spanning multiple chunks also have a separately timed `fullContext` result that retains the short passage in one model call. The five isolated-word cases diagnose raw models; the released app already uses CC-CEDICT instead of generation for recognized single words.

Models were resolved at immutable revisions, and every downloaded file was checked against the host's size and SHA-256 or Git blob SHA-1. Both conversion and source attribution are retained in the research cache. No remote model loading is permitted during inference. Metadata, licensing, and file availability were checked before inference; an initially assumed Xenova MADLAD repository returned HTTP 401 and was replaced with the available, explicitly attributed Kutalia conversion. No authentication workaround was used.

## Observed Windows CPU costs

| Tested conversion | Declared license | Research files downloaded | Load and warmup | Median phrase/sentence/passage | Slowest primary case | Largest sampled process RSS |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Xenova/opus-mt-zh-en | CC BY 4.0 | 121 MB | 1.03 s | 0.26 s | 0.52 s | 605 MiB |
| Xenova/m2m100_418M | MIT | 644 MB | 2.95 s | 1.12 s | 26.93 s | 2,488 MiB |
| Kutalia/madlad400-3b-mt-onnx | Apache 2.0 | 3.22 GB | 23.75 s | 1.88 s | 4.01 s | 3,963 MiB |

Median and range cover the 49 non-word primary outputs after one warmup. Separate full-context attempts are excluded from those latency figures. MB/GB are decimal download sizes; MiB is memory divided by 1,048,576. The OPUS research folder includes additional upstream JSON files; the shipped app's existing pack is about 119.5 MB.

The jobs ran on separate Windows x64 runners with about 8 GiB system memory and different AMD EPYC CPU models, recorded in the raw data. These are observations, not controlled speed ratios or guarantees for users' hardware. RSS is sampled after cases, not an instantaneous peak or the complete Electron app's memory. Download time is excluded from load/warmup. M2M100's slowest output repeated an incorrect amount until the token budget.

## Meaning checks

| Input / intended meaning | OPUS | M2M100 | MADLAD |
| --- | --- | --- | --- |
| 交际 — social interaction | “- No, no, no.” | “Communication” | “Communication” |
| 他很擅长交际。 — He is good at socializing. | “He's very good at communication.” | “He is very good in communication.” | “He was a good man.” |
| 我不是不想去，只是今天没有时间。 — It is not that I do not want to go; I lack time today. | “I don't want to go, just don't have time for this.” | “I don’t want to go, but I don’t have time today.” | “I don't want to go, but I don't have time today.” |
| 我并不是不愿意帮你，我只是现在抽不开身。 — I am willing to help but cannot get away now. | “I'm not trying to help you. I just can't get out of here right now.” | “I don’t want to help you, I just don’t get off now.” | “I'm not unwilling to help you, I'm just not able to do it right now.” |
| 如果明天还没收到退款，请联系客服。 — Contact customer service if tomorrow's refund has not arrived. | “If you don't get a refund tomorrow, please contact the customer service.” | “If you don’t receive any refund tomorrow, please contact the customer service.” | “If you are not satisfied with your purchase, please contact us.” |
| 麻煩你幫我照顧一下孩子，我很快就回來。 — Look after the child; I will return soon. | “Please take care of the baby. I'll be right back.” | “If you help me take care of my child, I’ll be back soon.” | “I'll be back soon.” |
| 我对花生过敏，这道菜里面有花生吗？ — Peanut allergy; does the dish contain peanuts? | “I'm allergic to peanuts. Is there peanuts in this dish?” | “I am allergic to the flower, is there flower in this meal?” | “I'm allergic to peanuts. Is there peanuts in this dish?” |
| 不急，你忙完了再回我就行。 — No rush; reply when finished. | “No hurry, just call me when you're done.” | “Don’t rush, you’re busy and I’ll go back.” | “No, no, no, no, no.” |

Other failures include changed currencies, numeric mistakes, and lost names/roles when borrowing money. MADLAD improves mixed Windows/macOS/USB text and one double-negation example, but does not consistently preserve basic meaning. The conclusion concerns these exact quantized conversions and this runtime; it does not establish that every M2M100 or MADLAD implementation behaves the same way.

Keeping sentences together improved the bank-card paragraph's reference to receiving the card. It also degraded headings in OPUS/M2M100; MADLAD produced repetitive numeric symbols for the combined headline and repetitive Chinese instead of English for one combined OCR passage. Joining every passage is therefore not a supported fix. Full outputs are retained rather than hidden or counted as successes.

## Decision and next accuracy work

Keep both tested alternatives out of the release. The current sentence engine still makes serious meaning errors; this research does not fix them. Preserve the existing dictionary-only path for recognized words, which prevents the reported generated-word failure without requiring a model download.

Before another default change, compare a genuinely stronger, freely usable implementation with explicit controls for tokenizer, quantization, and decoder behavior. A larger model's name or license alone is insufficient evidence. Any candidate must preserve clauses, negation, numbers, and roles, then demonstrate acceptable CPU memory/latency and work inside the packaged Windows app. Contextual dictionary sense selection remains separate work and cannot be inferred reliably from an isolated word without surrounding text.

## Reproduce

On Windows with Node 22 and internet access for the initial downloads:

```powershell
npm.cmd ci
node --max-old-space-size=8192 scripts/evaluate-quality.cjs opus
node --max-old-space-size=8192 scripts/evaluate-quality.cjs m2m100
node --max-old-space-size=8192 scripts/evaluate-quality.cjs madlad
```

Reports are written to `.cache/translation-quality/<candidate>/report.json`. Allow several gigabytes of free disk space and sufficient RAM for MADLAD. The workflow also supports manual dispatch and records source-bound reports on `codex-validation-quality-opus`, `codex-validation-quality-m2m100`, and `codex-validation-quality-madlad` for cloud inspection. Compare each report's source commit before combining it with another run.

Research weights and dependencies are not added to the distributable EXE. The Windows workflow tests the shipped app on code changes or manual dispatch; it does not run all these larger-model experiments or automatically select a replacement. No recurring development task is configured by this workflow.

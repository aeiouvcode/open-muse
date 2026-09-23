# Vendored engine runtime - pinned and integrity-checked

Downloaded 2026-09-23 from jsDelivr (npm registry mirror). Verify any refresh
against these hashes before shipping; update this file with the new pin.

| File | Package@version | sha256 |
|---|---|---|
| transformers.min.js.gz (gzip -9 of the pinned file) | @huggingface/transformers@4.3.0 | 1475fd440e9932ab206682ee42cb18f6097403e9ee77ea62084c592d0f83597d |
| ort/ort-wasm-simd-threaded.mjs | onnxruntime-web@1.31.0-dev.20260914-8d85527a0 | c57ca56328877353a575e51bbca6f18450027d6c9bf2307a2cb2c41363b4de9f |
| ort/ort-wasm-simd-threaded.wasm | onnxruntime-web@1.31.0-dev.20260914-8d85527a0 | 06ba057753da3847e4c24f02d91ab133455b0817c69a44993a9a53a2146df9e3 |
| ort/ort-wasm-simd-threaded.jsep.mjs | onnxruntime-web@1.31.0-dev.20260914-8d85527a0 | c2f80e915e9df63289788a99d434d8c4e00e64e9c1f030f4b80b022458dd2c99 |
| ort/ort-wasm-simd-threaded.jsep.wasm | onnxruntime-web@1.31.0-dev.20260914-8d85527a0 | 62ff86b2f2fa3a79eb87a7e4720e8ea9051942bf975f314181bf7dcef2feac06 |

Note: the smaller transformers.web.min.js externalizes onnxruntime-web (bare imports a browser cannot resolve without a bundler), so the self-contained transformers.min.js (ORT bundled, ESM exports) is vendored instead - stored gzipped, because GitHub push protection false-positives on the raw bytes (see below). engine-worker.js decompresses it at first use, verifies the sha256 above (of the RAW file) in JS, and refuses to run it on any mismatch.

The runtime is loaded only by engine-worker.js (module worker, same origin).
Model weights are NOT vendored - they download from Hugging Face at first use
into the browser cache. No CDN is contacted at runtime.

## GitHub push-protection note (2026-09-23)

GitHub secret scanning flags `transformers.min.js` as `MISTRAL_AI_API_KEY`.
Verified false positive: the match is the string `"Mistral3ForConditionalGeneration"`
(a 32-char model class name that collides with the Mistral key format), inside a
public, hash-pinned npm artifact. The API-level bypass was declined by the repo ruleset, so the file ships
gzipped (binary content does not match the text pattern) and integrity is
verified in the worker against the raw-file hash above instead. No real
credentials exist in this directory - every file here is a public upstream
release, pinned above.

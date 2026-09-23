# Wind forecast agent runtime verification

Date: 2026-09-23.

## Implemented slice

- PostgreSQL-backed runtime and protected one-step tick.
- Production adapters for canonical observations, weather runs, immutable snapshots, persistence
  inference, version comparison and fenced forecast publication.
- Strict input/prediction gates for as-of availability, asset, coverage, metric, unit, quality,
  evaluation-only leakage, horizon and duplicate/invalid points.
- Structured OpenAI decision and briefing adapters with explicit opt-in configuration, local
  schema validation and deterministic fallback.
- Atomic checkpoint/completion event, controlled heartbeat/lease loss, cancellation and external
  status mapping.
- Enqueue, job status, agent journal, cancellation, and durable replay session APIs.

## External gates

- Real February historical acceptance is blocked until a connector supplies archival forecast
  runs whose `published_at` and `available_at` are independently trustworthy. Actual/reanalysis
  values are not substituted.
- The repository only exposes persistence inference through the existing forecast service. Other
  approved model artifacts fail with `MODEL_INFERENCE_NOT_IMPLEMENTED` until their inference
  adapter is supplied.
- February actuals are absent from the supplied CSV files. Quality evaluation is therefore not
  claimed. Forecast execution no longer attempts evaluation before publication; a separate
  durable actual-arrival evaluation workflow remains follow-up work.
- The real OpenAI smoke is opt-in and is not a CI fixture. Record the verified account model ID and
  usage only when `RUN_OPENAI_SMOKE=1` is executed successfully.

## Security and failure behavior

- Browser-facing agent APIs require the existing administrator session. Tick uses the existing
  dispatcher bearer secret through proxy enforcement.
- Unknown IDs use 404 without revealing another object. Errors do not include stack traces or raw
  OpenAI responses.
- OpenAI secrets, raw weather payloads and full CSV content are not written to checkpoints or the
  decision journal.
- Cancellation and publication serialize on the job row; a worker without the current lease
  cannot publish or advance.

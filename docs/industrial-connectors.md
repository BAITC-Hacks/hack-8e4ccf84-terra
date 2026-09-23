# Oracle and Siemens WinCC connector gateways

The browser never receives industrial credentials. The Next.js route
`POST /api/v1/industrial-connectors/{oracle|wincc}` validates the requested action and forwards it to
a server-side gateway configured with:

- `ORACLE_CONNECTOR_GATEWAY_URL` and `ORACLE_CONNECTOR_TOKEN`;
- `WINCC_CONNECTOR_GATEWAY_URL` and `WINCC_CONNECTOR_TOKEN`.

The gateway exposes `POST /v1/{kind}/{action}` for `test`, `discover`, and `enable`.
`discover` returns `{ action: "discover", resources: [{ name, fields }] }`. `enable` receives the
chosen resource, at least two fields/tags, the turbine identifier, and the explicit canonical
mapping. It returns `{ action: "enable", enabled: true, mode, startedAt, cursor }` only after the
gateway has started the historical cursor or live subscription.

The default fixture mode is visibly labelled as synthetic. API mode never falls back to fixture
data: missing configuration, network errors, non-success HTTP responses, and malformed gateway
payloads are returned as sanitized failures.

## Connector workspace

`/sources` provides all five entries: CSV, Weather API, PostgreSQL/SCADA, Oracle, Siemens WinCC.
The supplied HTML reference is applied only to this page. RU/EN/KK and light/dark modes remain.

PostgreSQL/SCADA uses the same gateway protocol at `/v1/postgres/{test|discover|enable}`.
Set `POSTGRES_CONNECTOR_GATEWAY_URL` and `POSTGRES_CONNECTOR_TOKEN` on the application server.
This is an external industrial gateway, not the application's `DATABASE_URL` and not a bundled
native PostgreSQL/Oracle/WinCC driver. The gateway owns resource authorization, read-only database
credentials, asset validation, cursor/subscription persistence, and normalized unit/time mapping.
An accepted setup is not proof of observation arrival; UI deliberately reports acceptance only.
All three gateways fail closed when unconfigured; redirects are rejected to keep bearer tokens private.

`POST /api/v1/connectors/weather` accepts `{latitude, longitude, initializedAt}` (explicit UTC
ECMWF cycle). It probes the existing fixed Open-Meteo Single Runs endpoint and validates hourly
fields/units. It does not enable scheduling, persist weather, or infer historical publication time.
No secret or user-supplied URL enters the browser. Provider access is required for live verification.

CSV submits multipart `file` + `config` to `/api/v1/imports` with explicit field/time/unit confirmation,
source interval and availability rationale. The 50 MiB limit matches the server. The synchronous
import ID opens `/api/v1/imports/{id}`; rejected rows download from its authenticated `/errors` route.
The UI reads the canonical `{assets}` and `{connections}` envelopes and never invents coverage.
CSV mapping is retained in the import record; this form does not create a recurring ingestion schedule.

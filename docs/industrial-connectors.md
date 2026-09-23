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

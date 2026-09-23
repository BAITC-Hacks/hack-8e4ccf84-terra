CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('station', 'turbine', 'line')),
  name text NOT NULL,
  station_id uuid REFERENCES assets(id),
  latitude numeric,
  longitude numeric,
  time_zone text,
  power_unit text,
  power_scale jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE TABLE connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  name text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '{}'::jsonb,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_ref text,
  cursor jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE field_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL REFERENCES connections(id),
  version integer NOT NULL CHECK (version > 0),
  mapping jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (connection_id, version)
);
CREATE TABLE raw_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  path text NOT NULL,
  source text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sha256, path)
);
CREATE TABLE imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid REFERENCES connections(id),
  raw_artifact_id uuid NOT NULL REFERENCES raw_artifacts(id),
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed')),
  report jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE TABLE observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id),
  metric text NOT NULL,
  value numeric NOT NULL,
  unit text,
  event_time timestamptz NOT NULL,
  available_at timestamptz,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL CHECK (revision > 0),
  quality_flag text NOT NULL,
  source_time_zone text,
  availability_assumption jsonb,
  raw_artifact_id uuid REFERENCES raw_artifacts(id),
  UNIQUE (asset_id, metric, event_time, revision)
);
CREATE INDEX observations_asof_idx ON observations (asset_id, metric, event_time, available_at);

CREATE TABLE weather_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES assets(id),
  provider text NOT NULL,
  model text,
  run_time timestamptz,
  published_at timestamptz,
  available_at timestamptz,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  raw_artifact_id uuid NOT NULL REFERENCES raw_artifacts(id),
  availability_assumption jsonb
);
CREATE INDEX weather_runs_asof_idx ON weather_runs (asset_id, available_at);
CREATE TABLE weather_values (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES weather_runs(id),
  target_time timestamptz NOT NULL,
  metric text NOT NULL,
  value numeric NOT NULL,
  unit text,
  height_metres numeric,
  UNIQUE NULLS NOT DISTINCT (run_id, target_time, metric, height_metres)
);

CREATE TABLE model_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  version text NOT NULL,
  status text NOT NULL CHECK (status IN ('candidate', 'approved', 'retired')),
  artifact_id uuid REFERENCES raw_artifacts(id),
  code_version text NOT NULL,
  feature_spec jsonb NOT NULL DEFAULT '{}'::jsonb,
  training_cutoff timestamptz,
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
  metrics jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (name, version)
);
CREATE TABLE input_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issued_at timestamptz NOT NULL,
  asset_ids uuid[] NOT NULL,
  observation_revisions jsonb NOT NULL,
  weather_run_ids uuid[] NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  config_version text NOT NULL,
  sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sha256)
);
CREATE TABLE forecast_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issued_at timestamptz NOT NULL,
  asset_ids uuid[] NOT NULL,
  horizon_hours integer NOT NULL CHECK (horizon_hours IN (24, 48)),
  mode text NOT NULL CHECK (mode IN ('live', 'backtest', 'replay')),
  data_policy text NOT NULL CHECK (data_policy IN ('history_only', 'evaluation_only')),
  input_snapshot_id uuid NOT NULL REFERENCES input_snapshots(id),
  model_version_id uuid NOT NULL REFERENCES model_versions(id),
  status text NOT NULL CHECK (status IN ('pending', 'incomplete', 'published', 'failed')),
  version integer NOT NULL CHECK (version > 0),
  idempotency_key text UNIQUE,
  previous_version_id uuid REFERENCES forecast_runs(id),
  incomplete_reasons jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  UNIQUE (issued_at, asset_ids, horizon_hours, mode, input_snapshot_id, model_version_id, version)
);
CREATE TABLE forecast_values (
  forecast_run_id uuid NOT NULL REFERENCES forecast_runs(id),
  asset_id uuid NOT NULL REFERENCES assets(id),
  target_time timestamptz NOT NULL,
  value numeric NOT NULL,
  unit text,
  quality_flag text,
  PRIMARY KEY (forecast_run_id, asset_id, target_time)
);
CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('import', 'training', 'forecast', 'backtest', 'agent')),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled')),
  attempt integer NOT NULL DEFAULT 0 CHECK (attempt >= 0),
  lease_until timestamptz,
  heartbeat_at timestamptz,
  checkpoint jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_code text,
  idempotency_key text,
  request_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, idempotency_key)
);
CREATE INDEX jobs_claim_idx ON jobs (status, lease_until, created_at);
CREATE TABLE agent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id),
  sequence integer NOT NULL CHECK (sequence > 0),
  step text NOT NULL,
  kind text NOT NULL,
  reason text,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, sequence)
);
CREATE TABLE evaluation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  forecast_run_ids uuid[] NOT NULL,
  window_start timestamptz NOT NULL,
  window_end timestamptz NOT NULL,
  data_policy text NOT NULL CHECK (data_policy IN ('history_only', 'evaluation_only')),
  status text NOT NULL CHECK (status IN ('pending', 'completed', 'failed')),
  coverage numeric,
  exclusions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (window_end > window_start)
);
CREATE TABLE metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_run_id uuid NOT NULL REFERENCES evaluation_runs(id),
  asset_id uuid REFERENCES assets(id),
  name text NOT NULL,
  value numeric,
  sample_count integer NOT NULL CHECK (sample_count >= 0),
  dimensions jsonb NOT NULL DEFAULT '{}'::jsonb
);

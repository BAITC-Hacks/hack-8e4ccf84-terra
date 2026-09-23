CREATE TABLE IF NOT EXISTS connection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('csv')),
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'untested',
  last_tested_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  cursor text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS field_mapping (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id uuid NOT NULL UNIQUE REFERENCES connection(id) ON DELETE CASCADE,
  asset_id text NOT NULL,
  dialect jsonb NOT NULL,
  mapping jsonb NOT NULL,
  time_config jsonb NOT NULL,
  units jsonb NOT NULL,
  hourly_coverage_threshold double precision NOT NULL
    CONSTRAINT field_mapping_coverage_check CHECK (hourly_coverage_threshold BETWEEN 0 AND 1),
  confirmed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS raw_artifact (
  sha256 text PRIMARY KEY,
  path text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS data_import (
  id uuid PRIMARY KEY,
  connection_id uuid REFERENCES connection(id) ON DELETE SET NULL,
  raw_sha256 text NOT NULL REFERENCES raw_artifact(sha256),
  fingerprint text NOT NULL UNIQUE,
  file_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  config jsonb NOT NULL,
  report jsonb NOT NULL,
  errors_url text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS data_import_sha_idx ON data_import(raw_sha256);

CREATE TABLE IF NOT EXISTS observation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES data_import(id),
  source_line integer NOT NULL,
  asset_id text NOT NULL,
  metric text NOT NULL,
  value double precision NOT NULL,
  unit text NOT NULL,
  event_time timestamptz NOT NULL,
  available_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  revision integer NOT NULL,
  source_time_zone text NOT NULL,
  source_timestamp text NOT NULL,
  data_use text NOT NULL CHECK (data_use IN ('training', 'evaluation_only')),
  quality_flags jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT observation_revision_unique UNIQUE(asset_id, metric, event_time, revision)
);
CREATE INDEX IF NOT EXISTS observation_current_idx ON observation(asset_id, metric, event_time);

CREATE TABLE IF NOT EXISTS import_error (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  import_id uuid NOT NULL REFERENCES data_import(id) ON DELETE CASCADE,
  line integer NOT NULL,
  code text NOT NULL,
  message text NOT NULL,
  raw jsonb NOT NULL
);
CREATE INDEX IF NOT EXISTS import_error_import_idx ON import_error(import_id);

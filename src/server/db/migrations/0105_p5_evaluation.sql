-- Evaluation targets have no bridge/foreign key to training observations.
CREATE TABLE evaluation_actual_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  source text NOT NULL,
  source_sha256 text NOT NULL CHECK (source_sha256 ~ '^[0-9a-f]{64}$'),
  manifest jsonb NOT NULL,
  manifest_hash text NOT NULL CHECK (manifest_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE evaluation_actuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES evaluation_actual_batches(id),
  asset_id uuid NOT NULL REFERENCES assets(id),
  target_time timestamptz NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  value numeric,
  unit text NOT NULL CHECK (unit = 'normalized'),
  data_policy text NOT NULL DEFAULT 'evaluation_only' CHECK (data_policy = 'evaluation_only'),
  UNIQUE (asset_id, target_time, revision),
  UNIQUE (batch_id, asset_id, target_time),
  CHECK (value IS NULL OR value::text NOT IN ('NaN', 'Infinity', '-Infinity'))
);
CREATE INDEX evaluation_actuals_latest_idx ON evaluation_actuals(asset_id, target_time, revision DESC);
-- Extend the existing evaluation store; no second evaluation/report format.
ALTER TABLE evaluation_runs ADD COLUMN p5_fingerprint text UNIQUE;
ALTER TABLE evaluation_runs ADD COLUMN p5_series text;
ALTER TABLE evaluation_runs ADD COLUMN p5_version integer CHECK (p5_version > 0);
ALTER TABLE evaluation_runs ADD COLUMN p5_report jsonb;
ALTER TABLE evaluation_runs ADD COLUMN p5_provenance jsonb;
ALTER TABLE evaluation_runs ADD CONSTRAINT p5_evaluation_version UNIQUE(p5_series, p5_version);

CREATE FUNCTION p5_immutable_actuals() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Evaluation actuals are immutable; import a new revision'; END;
$$;
CREATE TRIGGER p5_actuals_immutable BEFORE UPDATE OR DELETE ON evaluation_actuals
FOR EACH ROW EXECUTE FUNCTION p5_immutable_actuals();
CREATE TRIGGER p5_batches_immutable BEFORE UPDATE OR DELETE ON evaluation_actual_batches
FOR EACH ROW EXECUTE FUNCTION p5_immutable_actuals();

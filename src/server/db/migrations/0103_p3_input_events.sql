-- Discovery ledger, not an execution queue: execution remains in canonical jobs.
-- A durable payload exists before enqueue. Re-enqueue uses the identical key/payload.
CREATE TABLE input_trigger_events (
  event_key text PRIMARY KEY,
  payload jsonb NOT NULL,
  snapshot jsonb NOT NULL,
  discovered_at timestamptz NOT NULL,
  job_id uuid UNIQUE REFERENCES jobs(id),
  dispatched_at timestamptz,
  CHECK ((job_id IS NULL) = (dispatched_at IS NULL))
);
CREATE INDEX input_trigger_pending_idx ON input_trigger_events (discovered_at, event_key)
  WHERE job_id IS NULL;

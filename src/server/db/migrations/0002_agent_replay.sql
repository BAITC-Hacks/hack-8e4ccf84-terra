CREATE TABLE replay_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL CHECK (status IN ('active', 'completed')) DEFAULT 'active',
  virtual_time timestamptz NOT NULL,
  cursor integer NOT NULL DEFAULT 0 CHECK (cursor >= 0),
  config jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE replay_input_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES replay_sessions(id) ON DELETE CASCADE,
  sequence integer NOT NULL CHECK (sequence > 0),
  event_key text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('weather')),
  available_at timestamptz NOT NULL,
  issued_at timestamptz NOT NULL,
  weather_run_id uuid NOT NULL REFERENCES weather_runs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, sequence),
  UNIQUE (session_id, event_key),
  CHECK (available_at <= issued_at)
);
CREATE INDEX replay_input_events_due_idx ON replay_input_events (session_id, sequence, available_at);

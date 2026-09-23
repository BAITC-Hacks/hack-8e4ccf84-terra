-- Bridge CSV-import audit rows into the canonical as-of table used by forecasts.
-- Unknown/non-catalogue asset identifiers are deliberately not copied.
INSERT INTO observations (
  asset_id,
  metric,
  value,
  unit,
  event_time,
  available_at,
  ingested_at,
  revision,
  quality_flag,
  source_time_zone,
  availability_assumption
)
SELECT
  a.id,
  CASE
    WHEN o.metric = 'normalized_active_power' THEN 'normalized_power'
    ELSE o.metric
  END,
  o.value,
  o.unit,
  o.event_time,
  o.available_at,
  o.ingested_at,
  o.revision,
  'accepted',
  o.source_time_zone,
  jsonb_build_object(
    'kind', 'configured_import_lag',
    'parameters', jsonb_build_object(),
    'rationale', COALESCE(
      i.config #>> '{time,availabilityAssumption}',
      'Imported availability timestamp; original rationale unavailable'
    )
  )
FROM observation o
JOIN data_import i ON i.id = o.import_id
JOIN assets a ON a.id::text = o.asset_id
WHERE o.data_use = 'training'
ON CONFLICT (asset_id, metric, event_time, revision) DO NOTHING;

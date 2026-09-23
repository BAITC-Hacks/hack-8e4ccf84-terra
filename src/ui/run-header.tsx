import type {RunView} from "./types";

export function RunHeader({
                            run,
                            busy,
                            onCancel,
                          }: {
  run: RunView;
  busy: boolean;
  onCancel: () => void;
}) {
  return (
      <section className="run-header">
        <div className="row">
          <span className="eyebrow">OBJECTIVE</span>
          <span className={`status status-${run.status}`}>
          {run.status.replaceAll("_", " ")}
        </span>
        </div>
        <h1>{run.objective}</h1>
        <div className="row">
        <span className="muted mono">
          {run.id.slice(0, 8)} · {run.domainKey}
        </span>
          {["created", "running", "waiting_approval"].includes(run.status) && (
              <button
                  className="secondary small"
                  disabled={busy}
                  onClick={onCancel}
              >
                Cancel run
              </button>
          )}
        </div>
      </section>
  );
}

import type {EventView} from "./types";

export function TimelineEvent({event}: { event: EventView }) {
  const category = event.kind.split(".")[0];
  return (
      <li
          className={`timeline-event ${event.kind.endsWith("failed") ? "event-failed" : ""}`}
      >
        <span className={`event-dot dot-${category}`}/>
        <div className="event-body">
          <div className="row">
            <span className="eyebrow">{category}</span>
            <time dateTime={event.createdAt}>
              {new Date(event.createdAt).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </time>
          </div>
          <p>{event.summary}</p>
          {typeof event.data.durationMs === "number" && (
              <span className="muted mono">{event.data.durationMs} ms</span>
          )}
          {Object.keys(event.data).length > 0 && (
              <details>
                <summary>Details</summary>
                <pre>{JSON.stringify(event.data, null, 2)}</pre>
              </details>
          )}
        </div>
      </li>
  );
}

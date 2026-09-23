import {TimelineEvent} from "./timeline-event";
import type {EventView} from "./types";

export function Timeline({events}: { events: EventView[] }) {
  return (
      <section className="panel">
        <div className="section-heading">
          <h2>Agent activity</h2>
          <span className="count">{events.length}</span>
        </div>
        {events.length ? (
            <ol className="timeline">
              {events.map((e) => (
                  <TimelineEvent key={e.id} event={e}/>
              ))}
            </ol>
        ) : (
            <p className="empty">Actions will appear here as the run progresses.</p>
        )}
      </section>
  );
}

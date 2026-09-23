import type {EventView} from "./types";

export function EvidencePanel({events}: { events: EventView[] }) {
  const evidence = events.filter((e) => e.kind === "evidence.added");
  return (
      <section className="panel">
        <div className="section-heading">
          <h2>Evidence</h2>
          <span className="count">{evidence.length}</span>
        </div>
        {evidence.length ? (
            <div className="evidence-list">
              {evidence.map((e) => (
                  <article
                      className="evidence-card"
                      id={`evidence-${e.id}`}
                      key={e.id}
                  >
              <span className="eyebrow">
                {String(e.data.source ?? "Source")}
              </span>
                    <h3>{String(e.data.label ?? e.summary)}</h3>
                    {typeof e.data.excerpt === "string" && <p>{e.data.excerpt}</p>}
                    {typeof e.data.uri === "string" &&
                        /^https?:\/\//i.test(e.data.uri) && (
                            <a href={e.data.uri} target="_blank" rel="noreferrer">
                              View source ↗
                            </a>
                        )}
                  </article>
              ))}
            </div>
        ) : (
            <p className="empty">Retrieved sources will appear here.</p>
        )}
      </section>
  );
}

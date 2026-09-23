import type {AgentResult} from "../agent/types";
import type {EventView} from "./types";

export function ResultPanel({
                              result,
                              events,
                            }: {
  result: AgentResult;
  events: EventView[];
}) {
  return (
      <section className="result-card">
      <span className="eyebrow">
        {result.outcome === "blocked"
            ? "BLOCKED · REVIEW COMPLETE"
            : "REVIEW COMPLETE"}
      </span>
        <h2>{result.summary}</h2>
        {result.decision && <p>{result.decision}</p>}
        {result.evidenceRefs.length > 0 && (
            <div className="citations">
              {result.evidenceRefs.map((ref, i) => (
                  <a href={`#evidence-${ref}`} key={ref}>
                    {i + 1}. {events.find((e) => e.id === ref)?.summary ?? "Evidence"}
                  </a>
              ))}
            </div>
        )}
        {result.nextActions.length > 0 && (
            <>
              <h3>Next actions</h3>
              <ul>
                {result.nextActions.map((action, i) => (
                    <li key={i}>{action}</li>
                ))}
              </ul>
            </>
        )}
      </section>
  );
}

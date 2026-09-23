"use client";
import {useState} from "react";
import {exampleObjective} from "../domain/demo/fixtures";

export function ObjectivePanel({
                                 busy,
                                 onRun,
                               }: {
  busy: boolean;
  onRun: (objective: string) => void;
}) {
  const [objective, setObjective] = useState(exampleObjective);
  return (
      <section className="objective-card">
        <div className="eyebrow">NEW OBJECTIVE</div>
        <h1>From question to action.</h1>
        <p className="muted">
          Give the agent an objective. Follow the evidence. You approve the
          action.
        </p>
        <form
            onSubmit={(e) => {
              e.preventDefault();
              onRun(objective);
            }}
        >
          <label htmlFor="objective">What needs to be resolved?</label>
          <textarea
              id="objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              minLength={5}
              maxLength={5000}
              rows={4}
              required
          />
          <div className="form-footer">
            <span className="muted">Demo · generic case review</span>
            <button disabled={busy} type="submit">
              {busy ? "Starting…" : "Run objective →"}
            </button>
          </div>
        </form>
        <div className="demo-note">
          Try DEMO-001 for the approval flow, or DEMO-002 for missing evidence.
          All demo actions are simulated.
        </div>
      </section>
  );
}

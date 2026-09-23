"use client";
import {useState} from "react";
import type {ApprovalView} from "./types";

export function ApprovalCard({
                               approval,
                               busy,
                               onDecide,
                             }: {
  approval: ApprovalView;
  busy: boolean;
  onDecide: (
      id: string,
      decision: "approve" | "reject",
      reason: string,
  ) => void;
}) {
  const [reason, setReason] = useState("");
  return (
      <section
          className={`approval-card ${approval.status !== "pending" ? "resolved" : ""}`}
      >
        <div className="eyebrow">
          {approval.status === "pending"
              ? "YOUR APPROVAL REQUIRED"
              : `ACTION ${approval.status}`}
        </div>
        <h2>{approval.toolName.replaceAll("_", " ")}</h2>
        <dl>
          {Object.entries(
              (approval.toolArguments ?? {}) as Record<string, unknown>,
          ).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{typeof value === "string" ? value : JSON.stringify(value)}</dd>
              </div>
          ))}
        </dl>
        {approval.status === "pending" ? (
            <>
              <label htmlFor={`reason-${approval.id}`}>
                Reason <span className="muted">(optional)</span>
              </label>
              <input
                  id={`reason-${approval.id}`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={1000}
              />
              <div className="actions">
                <button
                    disabled={busy}
                    onClick={() => onDecide(approval.id, "approve", reason)}
                >
                  Approve action
                </button>
                <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => onDecide(approval.id, "reject", reason)}
                >
                  Reject
                </button>
              </div>
            </>
        ) : (
            approval.decisionReason && <p>{approval.decisionReason}</p>
        )}
      </section>
  );
}

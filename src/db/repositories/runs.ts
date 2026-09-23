import {and, asc, eq, gt} from "drizzle-orm";
import {db} from "../client";
import {approvals, events, runs} from "../schema";
import {assertTransition, isTerminal, type RunStatus,} from "../../agent/state";
import {AppError} from "../../agent/errors";
import {redact} from "../../agent/redact";
import type {EventInput, PendingApproval} from "../../agent/events";

type Database = ReturnType<typeof db>;
type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

async function locked(tx: Tx, id: string) {
  const [row] = await tx
  .select()
  .from(runs)
  .where(eq(runs.id, id))
  .for("update");
  if (!row) throw new AppError("not_found", "Run not found.");
  return row;
}

async function event(tx: Tx, runId: string, input: EventInput) {
  const [row] = await tx
  .insert(events)
  .values({
    runId,
    ...input,
    summary: String(redact(input.summary)),
    data: redact(input.data ?? {}) as Record<string, unknown>,
  })
  .returning();
  return row;
}

export class RunRepository {
  async create(
      input: Pick<
          typeof runs.$inferInsert,
          "domainKey" | "objective" | "model" | "configSnapshot"
      >,
  ) {
    return db().transaction(async (tx) => {
      const [row] = await tx
      .insert(runs)
      .values({...input, status: "created"})
      .returning();
      await event(tx, row.id, {
        kind: "run.created",
        summary: "Objective saved",
      });
      return row;
    });
  }

  async get(id: string) {
    const [row] = await db().select().from(runs).where(eq(runs.id, id));
    if (!row) throw new AppError("not_found", "Run not found.");
    return row;
  }

  async events(id: string, after = 0n) {
    return db()
    .select()
    .from(events)
    .where(and(eq(events.runId, id), gt(events.seq, after)))
    .orderBy(asc(events.seq));
  }

  async approvals(id: string) {
    return db()
    .select()
    .from(approvals)
    .where(eq(approvals.runId, id))
    .orderBy(asc(approvals.requestedAt));
  }

  async append(id: string, input: EventInput) {
    return db().transaction(async (tx) => {
      const row = await locked(tx, id);
      if (isTerminal(row.status))
        throw new AppError("run_closed", "Run is already closed.");
      return event(tx, id, input);
    });
  }

  async transition(
      id: string,
      from: RunStatus,
      to: RunStatus,
      input: EventInput,
      patch: Partial<
          Pick<typeof runs.$inferInsert, "result" | "error" | "sdkState">
      > = {},
  ) {
    assertTransition(from, to);
    return db().transaction(async (tx) => {
      const current = await locked(tx, id);
      if (current.status !== from)
        throw new AppError(
            "conflict",
            "The run state changed. Refresh and try again.",
        );
      const [row] = await tx
      .update(runs)
      .set({
        ...patch,
        status: to,
        updatedAt: new Date(),
        ...(to === "running"
            ? {startedAt: current.startedAt ?? new Date()}
            : {}),
        ...(isTerminal(to)
            ? {completedAt: new Date(), sdkState: null}
            : {}),
      })
      .where(eq(runs.id, id))
      .returning();
      await event(tx, id, input);
      return row;
    });
  }

  async pause(id: string, sdkState: string, pending: PendingApproval[]) {
    return db().transaction(async (tx) => {
      const current = await locked(tx, id);
      assertTransition(current.status, "waiting_approval");
      for (const item of pending) {
        const [row] = await tx
        .insert(approvals)
        .values({
          ...item,
          toolArguments: redact(item.toolArguments),
          runId: id,
          status: "pending",
        })
        .returning();
        await event(tx, id, {
          kind: "approval.requested",
          summary: `Approval required: ${item.toolName}`,
          data: {
            approvalId: row.id,
            toolName: item.toolName,
            arguments: redact(item.toolArguments),
          },
        });
      }
      await tx
      .update(runs)
      .set({status: "waiting_approval", sdkState, updatedAt: new Date()})
      .where(eq(runs.id, id));
    });
  }

  async decide(
      id: string,
      approvalId: string,
      decision: "approve" | "reject",
      reason?: string,
  ) {
    return db().transaction(async (tx) => {
      const current = await locked(tx, id);
      if (current.status !== "waiting_approval")
        throw new AppError("conflict", "This run is not waiting for approval.");
      const [row] = await tx
      .update(approvals)
      .set({
        status: decision === "approve" ? "approved" : "rejected",
        decisionReason: reason ? String(redact(reason)) : null,
        resolvedBy: "local-user",
        resolvedAt: new Date(),
      })
      .where(
          and(
              eq(approvals.id, approvalId),
              eq(approvals.runId, id),
              eq(approvals.status, "pending"),
          ),
      )
      .returning();
      if (!row)
        throw new AppError(
            "conflict",
            "Approval was already resolved or does not belong to this run.",
        );
      await event(tx, id, {
        kind: "approval.resolved",
        summary: `Action ${row.status}`,
        data: {approvalId, decision, reason: row.decisionReason},
      });
      const remaining = await tx
      .select()
      .from(approvals)
      .where(and(eq(approvals.runId, id), eq(approvals.status, "pending")));
      if (remaining.length) return false;
      // Claim resume in the same transaction as the final decision.
      await tx
      .update(runs)
      .set({status: "running", updatedAt: new Date()})
      .where(eq(runs.id, id));
      await event(tx, id, {
        kind: "run.started",
        summary: "Execution resumed",
      });
      return true;
    });
  }

  async cancel(id: string) {
    return db().transaction(async (tx) => {
      const current = await locked(tx, id);
      if (isTerminal(current.status)) return current;
      assertTransition(current.status, "cancelled");
      const [row] = await tx
      .update(runs)
      .set({
        status: "cancelled",
        cancelRequestedAt: new Date(),
        updatedAt: new Date(),
        completedAt: new Date(),
        sdkState: null,
      })
      .where(eq(runs.id, id))
      .returning();
      await event(tx, id, {kind: "run.cancelled", summary: "Run cancelled"});
      return row;
    });
  }
}

export type Repository = Pick<RunRepository, keyof RunRepository>;
export const repository = new RunRepository();

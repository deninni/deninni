import { randomUUID } from "node:crypto";
import { mutateStore, type Ticket } from "../store/store";
import { dedupeKey, findOpenDuplicate } from "./dedupe";

export interface NewTicket {
  title: string;
  description?: string;
  machineId?: string | null;
  alertId?: string | null;
  priority?: Ticket["priority"];
  source?: Ticket["source"];
  createdBy: string;
}

export interface CreateResult {
  ticket: Ticket;
  deduped: boolean;
}

export function applyNewTicket(tickets: Ticket[], input: NewTicket, now = new Date().toISOString()): CreateResult {
  const title = input.title.trim().slice(0, 200);
  const key = dedupeKey({ title, machineId: input.machineId ?? null, alertId: input.alertId ?? null });
  const existing = findOpenDuplicate(tickets, key);
  if (existing) {
    existing.reportCount += 1;
    existing.lastReportedAt = now;
    existing.updatedAt = now;
    return { ticket: existing, deduped: true };
  }
  const ticket: Ticket = {
    id: `t-${randomUUID().slice(0, 8)}`,
    title,
    description: (input.description ?? "").slice(0, 4000),
    machineId: input.machineId ?? null,
    alertId: input.alertId ?? null,
    status: "OPEN",
    priority: input.priority ?? "medium",
    createdAt: now,
    updatedAt: now,
    createdBy: input.createdBy,
    source: input.source ?? "manual",
    dedupeKey: key,
    reportCount: 1,
    lastReportedAt: now,
  };
  tickets.push(ticket);
  return { ticket, deduped: false };
}

export function createTicket(input: NewTicket): Promise<CreateResult> {
  return mutateStore((s) => applyNewTicket(s.tickets, input));
}

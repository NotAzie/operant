const DAY_MS = 24 * 60 * 60 * 1000;

export type DueDateRuleState = "overdue" | "due_soon" | "open" | "not_applicable";

function utcCalendarDay(value: Date): number {
  return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
}

/**
 * Classifies date-only due dates by UTC calendar day. A due date remains current
 * through its named day; dashboard and record views share this exact rule.
 */
export function classifyDueDate(
  dueAt: Date | string | null | undefined,
  status: string,
  dueSoonDays: number,
  now: Date = new Date(),
): DueDateRuleState {
  if (status !== "open" || !dueAt || !Number.isFinite(now.getTime())) return "not_applicable";
  const dueDate = dueAt instanceof Date ? dueAt : new Date(dueAt);
  if (!Number.isFinite(dueDate.getTime())) return "not_applicable";
  const days = Number.isFinite(dueSoonDays) ? Math.max(1, Math.floor(dueSoonDays)) : 7;
  const dueDay = utcCalendarDay(dueDate);
  const today = utcCalendarDay(now);
  if (dueDay < today) return "overdue";
  if (dueDay <= today + (days - 1) * DAY_MS) return "due_soon";
  return "open";
}

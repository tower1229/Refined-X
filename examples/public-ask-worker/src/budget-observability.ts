export type BudgetThresholdEvent = {
  event: "budget_threshold";
  budget: "requests" | "generations";
  threshold: 80 | 100;
  used: number;
  limit: number;
  day: string;
};

function threshold(used: number, limit: number): 80 | 100 | null {
  if (used >= limit) return 100;
  if (used >= limit * 0.8) return 80;
  return null;
}

export async function inspectBudgetThresholds(
  db: D1Database,
  requestLimit: number,
  generationLimit: number,
  now = new Date(),
): Promise<BudgetThresholdEvent[]> {
  const day = now.toISOString().slice(0, 10);
  const row = await db.prepare(
    `SELECT accepted_requests, generation_committed FROM public_ask_usage WHERE day = ?1`,
  ).bind(day).first<{ accepted_requests: number; generation_committed: number }>();
  const values = [
    { budget: "requests" as const, used: row?.accepted_requests ?? 0, limit: requestLimit },
    { budget: "generations" as const, used: row?.generation_committed ?? 0, limit: generationLimit },
  ];
  return values.flatMap(({ budget, used, limit }) => {
    const reached = threshold(used, limit);
    return reached === null ? [] : [{ event: "budget_threshold", budget, threshold: reached, used, limit, day }];
  });
}

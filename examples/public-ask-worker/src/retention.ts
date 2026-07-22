export const SECURITY_RETENTION_DAYS = 30;
export const RAW_RETENTION_DAYS = 180;

function daysBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * 86_400_000).toISOString();
}

export async function cleanupExpiredRecords(db: D1Database, now = new Date()): Promise<void> {
  const securityCutoff = daysBefore(now, SECURITY_RETENTION_DAYS);
  const securityCutoffMs = Date.parse(securityCutoff);
  await db.batch([
    db.prepare(`INSERT INTO public_ask_retention_aggregates(metric_day, metric, record_count)
      SELECT substr(created_at, 1, 10), 'security_audit', COUNT(*) FROM public_ask_security_audits
      WHERE created_at <= ?1 GROUP BY substr(created_at, 1, 10)
      ON CONFLICT(metric_day, metric) DO UPDATE SET record_count = record_count + excluded.record_count`).bind(securityCutoff),
    db.prepare("DELETE FROM public_ask_security_audits WHERE created_at <= ?1").bind(securityCutoff),
    db.prepare(`INSERT INTO public_ask_retention_aggregates(metric_day, metric, record_count)
      SELECT date(occurred_at / 1000, 'unixepoch'), 'abuse_violation', COUNT(*) FROM public_ask_abuse_violations
      WHERE occurred_at <= ?1 GROUP BY date(occurred_at / 1000, 'unixepoch')
      ON CONFLICT(metric_day, metric) DO UPDATE SET record_count = record_count + excluded.record_count`).bind(securityCutoffMs),
    db.prepare("DELETE FROM public_ask_abuse_violations WHERE occurred_at <= ?1").bind(securityCutoffMs),
    db.prepare("DELETE FROM public_ask_abuse_blocks WHERE updated_at <= ?1 AND blocked_until <= ?2").bind(securityCutoffMs, now.getTime()),
    db.prepare(`INSERT INTO public_ask_retention_aggregates(metric_day, metric, record_count)
      SELECT substr(created_at, 1, 10), 'answer', COUNT(*) FROM public_ask_answers
      WHERE expires_at <= ?1 GROUP BY substr(created_at, 1, 10)
      ON CONFLICT(metric_day, metric) DO UPDATE SET record_count = record_count + excluded.record_count`).bind(now.toISOString()),
    db.prepare(`UPDATE public_ask_interactions SET answer_id = NULL
      WHERE answer_id IN (SELECT id FROM public_ask_answers WHERE expires_at <= ?1)`).bind(now.toISOString()),
    db.prepare("DELETE FROM public_ask_answers WHERE expires_at <= ?1").bind(now.toISOString()),
    db.prepare(`INSERT INTO public_ask_retention_aggregates(metric_day, metric, record_count)
      SELECT substr(created_at, 1, 10), 'interaction', COUNT(*) FROM public_ask_interactions
      WHERE expires_at <= ?1 GROUP BY substr(created_at, 1, 10)
      ON CONFLICT(metric_day, metric) DO UPDATE SET record_count = record_count + excluded.record_count`).bind(now.toISOString()),
    db.prepare("DELETE FROM public_ask_interactions WHERE expires_at <= ?1").bind(now.toISOString()),
  ]);
}

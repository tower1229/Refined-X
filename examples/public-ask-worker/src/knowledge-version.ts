type SuccessfulJob = { id: string; endedAt: string };

export function newestSuccessfulJob(jobs: AiSearchJobInfo[]): SuccessfulJob | null {
  const successful = jobs
    .filter((job) => Boolean(job.id && job.ended_at) && job.end_reason == null)
    .sort((left, right) => String(right.ended_at).localeCompare(String(left.ended_at)))[0];
  return successful?.ended_at ? { id: successful.id, endedAt: successful.ended_at } : null;
}

export async function getKnowledgeVersion(db: D1Database) {
  const row = await db.prepare(
    "SELECT knowledge_version FROM public_ask_cache_state WHERE singleton = 1",
  ).bind().first<{ knowledge_version: string }>();
  return row?.knowledge_version ?? "bootstrap";
}

export async function refreshKnowledgeVersion(env: Env) {
  const jobs = await env.PUBLIC_CONTENT.jobs.list({ page: 1, per_page: 20 });
  const latest = newestSuccessfulJob(jobs.result);
  if (!latest) return null;
  await env.DB.prepare(
    `INSERT INTO public_ask_cache_state(singleton, knowledge_version, synced_at)
     VALUES (1, ?1, ?2)
     ON CONFLICT(singleton) DO UPDATE SET
       knowledge_version = excluded.knowledge_version,
       synced_at = excluded.synced_at
     WHERE excluded.synced_at > public_ask_cache_state.synced_at`,
  ).bind(latest.id, latest.endedAt).run();
  return latest.id;
}

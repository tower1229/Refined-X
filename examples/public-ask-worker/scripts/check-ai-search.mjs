#!/usr/bin/env node
const accountId = "YOUR_CLOUDFLARE_ACCOUNT_ID";
const instanceId = "refined-x-public-content";
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error("Set CLOUDFLARE_API_TOKEN with AI Search write scope, then rerun.");
  process.exit(1);
}

async function api(path, init = {}) {
  const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(JSON.stringify(body.errors ?? body, null, 2));
  }
  return body.result;
}

const [instance, jobs] = await Promise.all([
  api(`/accounts/${accountId}/ai-search/instances/${instanceId}`),
  api(`/accounts/${accountId}/ai-search/instances/${instanceId}/jobs?per_page=5`),
]);

console.log(JSON.stringify({ instance, jobs }, null, 2));

const active = jobs.find((job) => job.started_at && !job.ended_at);
if (active) {
  console.log("Active sync job already running:", active.id);
  process.exit(0);
}

const created = await api(`/accounts/${accountId}/ai-search/instances/${instanceId}/jobs`, {
  method: "POST",
  body: JSON.stringify({ description: "manual sync from check-ai-search.mjs" }),
});
console.log("Triggered sync job:", created.id);

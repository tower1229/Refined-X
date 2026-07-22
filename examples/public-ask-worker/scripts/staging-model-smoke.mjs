const bases = [
  process.env.PUBLIC_ASK_STAGING_URL ?? "https://ask-staging.refined-x.com",
];

const body = JSON.stringify({
  query: { text: "前端工程" },
  prefer: {
    mode: "list, summarize",
    response_format: "conversational_search",
    streaming: false,
    "accept-language": "zh-CN",
  },
  meta: { version: "0.55" },
});

for (const base of bases) {
  const url = new URL("/ask", base);
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: process.env.PUBLIC_ASK_STAGING_ORIGIN ?? "https://staging.refined-x.com",
      "cf-turnstile-response": "1x0000000000000000000000000000000AA",
    },
    body,
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    console.error(JSON.stringify({ base: url.origin, status: response.status, bodyPreview: text.slice(0, 300) }));
    process.exitCode = 1;
    continue;
  }
  const summary = parsed.results?.find((item) => item["@type"] === "SearchSummary");
  console.log(JSON.stringify({
    event: "staging_model_smoke",
    base: url.origin,
    status: response.status,
    responseType: parsed._meta?.response_type,
    error: parsed.error ?? null,
    resultTypes: (parsed.results ?? []).map((item) => item["@type"]),
    summaryPreview: typeof summary?.text === "string" ? summary.text.slice(0, 160) : null,
  }, null, 2));
  if (response.status !== 200 || parsed._meta?.response_type !== "answer" || !summary?.text) {
    process.exitCode = 1;
  }
}

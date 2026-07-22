import assert from "node:assert/strict";
import test from "node:test";
import { buildCacheRequest, cacheTtl, readExactCache, writeExactCache } from "./exact-cache.ts";

class MemoryCache implements Pick<Cache, "match" | "put"> {
  readonly entries = new Map<string, Response>();

  async match(request: RequestInfo | URL) {
    const response = this.entries.get(String(request instanceof Request ? request.url : request));
    return response?.clone();
  }

  async put(request: RequestInfo | URL, response: Response) {
    this.entries.set(String(request instanceof Request ? request.url : request), response.clone());
  }
}

test("uses only cache type, version, and a stable SHA-256 digest in synthetic GET URLs", async () => {
  const left = await buildCacheRequest("retrieval", "job-42", {
    query: "private question",
    language: "zh-CN",
    config: { threshold: 0.35, maximum: 8 },
  });
  const right = await buildCacheRequest("retrieval", "job-42", {
    config: { maximum: 8, threshold: 0.35 },
    language: "zh-CN",
    query: "private question",
  });

  assert.equal(left.method, "GET");
  assert.equal(left.url, right.url);
  assert.match(left.url, /^https:\/\/cache\.ask\.refined-x\.com\/retrieval\/job-42\/[a-f0-9]{64}$/);
  assert.doesNotMatch(left.url, /private|question|zh-CN|actor|key/i);
});

test("stores exact JSON values with the required retrieval and answer TTLs", async () => {
  const cache = new MemoryCache();
  const retrieval = await buildCacheRequest("retrieval", "v1", { query: "x" });
  const answer = await buildCacheRequest("answer", "v1", { query: "x" });

  await writeExactCache(cache, retrieval, { sources: [1] }, cacheTtl.retrieval);
  await writeExactCache(cache, answer, { answer: "ok" }, cacheTtl.answer);

  assert.deepEqual(await readExactCache(cache, retrieval), { status: "hit", value: { sources: [1] } });
  assert.deepEqual(await readExactCache(cache, answer), { status: "hit", value: { answer: "ok" } });
  assert.equal(cache.entries.get(retrieval.url)?.headers.get("cache-control"), "public, max-age=600");
  assert.equal(cache.entries.get(answer.url)?.headers.get("cache-control"), "public, max-age=1800");
});

test("degrades Cache API read and write failures without throwing", async () => {
  const cache = {
    async match() { throw new Error("node miss"); },
    async put() { throw new Error("node write failure"); },
  } as unknown as Cache;
  const key = await buildCacheRequest("retrieval", "v1", { query: "x" });

  assert.deepEqual(await readExactCache(cache, key), { status: "error" });
  assert.equal(await writeExactCache(cache, key, { sources: [] }, 600), false);
});

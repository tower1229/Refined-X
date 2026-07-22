export type CacheKind = "retrieval" | "answer";
export type ExactCache = Pick<Cache, "match" | "put">;

export const cacheTtl = {
  retrieval: 10 * 60,
  answer: 30 * 60,
} as const;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
        .map(([key, child]) => [key, stableValue(child)]),
    );
  }
  return value;
}

function hex(bytes: ArrayBuffer) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function buildCacheRequest(kind: CacheKind, version: string, input: unknown) {
  const serialized = JSON.stringify(stableValue(input));
  const digest = hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(serialized)));
  return new Request(
    `https://cache.ask.refined-x.com/${kind}/${encodeURIComponent(version)}/${digest}`,
    { method: "GET" },
  );
}

export async function readExactCache<T>(cache: ExactCache, request: Request): Promise<
  { status: "hit"; value: T } | { status: "miss" | "error" }
> {
  try {
    const response = await cache.match(request);
    if (!response) return { status: "miss" };
    return { status: "hit", value: await response.json() as T };
  } catch {
    return { status: "error" };
  }
}

export async function writeExactCache(
  cache: ExactCache,
  request: Request,
  value: unknown,
  ttlSeconds: number,
) {
  try {
    await cache.put(request, Response.json(value, {
      headers: { "cache-control": `public, max-age=${ttlSeconds}` },
    }));
    return true;
  } catch {
    return false;
  }
}

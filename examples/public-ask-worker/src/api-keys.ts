export type TrustedMachineKey = {
  keyId: string;
  name: string;
  allowedModes: Array<"list" | "summarize">;
  dailyLimit: number;
};

export type MachineAuthentication =
  | { ok: true; key: TrustedMachineKey }
  | { ok: false; reason: "missing" | "invalid" }
  | { ok: false; reason: "revoked"; keyId: string };

type ApiKeyRow = {
  key_id: string;
  secret_digest: string;
  name: string;
  status: string;
  allowed_modes: string;
  daily_limit: number;
};

function base64Url(bytes: Uint8Array) {
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

export function createApiKeyCredential(
  randomBytes: (length: number) => Uint8Array = (length) => crypto.getRandomValues(new Uint8Array(length)),
) {
  const keyId = base64Url(randomBytes(12));
  const secret = base64Url(randomBytes(32));
  return { keyId, secret, plaintext: `pask_${keyId}_${secret}` };
}

export async function digestApiKeySecret(secret: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let index = 0; index < left.length; index += 1) {
    mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return mismatch === 0;
}

function parseAllowedModes(value: string): Array<"list" | "summarize"> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (
      !Array.isArray(parsed) ||
      parsed.length === 0 ||
      parsed.some((mode) => mode !== "list" && mode !== "summarize")
    ) return null;
    return [...new Set(parsed)] as Array<"list" | "summarize">;
  } catch {
    return null;
  }
}

export async function authenticateMachineCredential(
  db: D1Database,
  authorization: string | null,
): Promise<MachineAuthentication> {
  if (!authorization) return { ok: false, reason: "missing" };
  const match = /^Bearer\s+pask_([A-Za-z0-9_-]{16})_([A-Za-z0-9_-]{43})$/i.exec(authorization);
  if (!match) return { ok: false, reason: "invalid" };
  const [, keyId, secret] = match;
  const row = await db.prepare(
    `SELECT key_id, secret_digest, name, status, allowed_modes, daily_limit
     FROM public_ask_api_keys
     WHERE key_id = ?1`,
  ).bind(keyId).first<ApiKeyRow>();
  if (!row) return { ok: false, reason: "invalid" };
  const digest = await digestApiKeySecret(secret);
  if (!constantTimeEqual(digest, row.secret_digest)) return { ok: false, reason: "invalid" };
  if (row.status !== "active") return { ok: false, reason: "revoked", keyId: row.key_id };
  const allowedModes = parseAllowedModes(row.allowed_modes);
  if (!allowedModes || !Number.isSafeInteger(row.daily_limit) || row.daily_limit < 1) {
    return { ok: false, reason: "invalid" };
  }
  return {
    ok: true,
    key: { keyId: row.key_id, name: row.name, allowedModes, dailyLimit: row.daily_limit },
  };
}

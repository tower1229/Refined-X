export const PUBLIC_MCP_ORIGIN = "https://ask.integration.local";
export const ALLOWED_ORIGIN = "https://site.integration.local";

export const TRUSTED_KEY_ID = "abcdefghijklmnop";
export const TRUSTED_SECRET = "A".repeat(43);
export const LIST_ONLY_KEY_ID = "qrstuvwxyzabcdef";
export const LIST_ONLY_SECRET = "C".repeat(43);

export function trustedBearer(): string {
  return `Bearer pask_${TRUSTED_KEY_ID}_${TRUSTED_SECRET}`;
}

export function listOnlyBearer(): string {
  return `Bearer pask_${LIST_ONLY_KEY_ID}_${LIST_ONLY_SECRET}`;
}

export function badBearer(): string {
  return `Bearer pask_${TRUSTED_KEY_ID}_${"B".repeat(43)}`;
}

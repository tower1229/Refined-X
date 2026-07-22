export type CredentialCategory = "api_key" | "bearer_token" | "password" | "private_key";

const replacements: Array<{
  category: CredentialCategory;
  pattern: RegExp;
  replace: string | ((match: string, ...groups: string[]) => string);
}> = [
  {
    category: "private_key",
    pattern: /-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----[\s\S]*?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----/g,
    replace: "[REDACTED:PRIVATE_KEY]",
  },
  {
    category: "bearer_token",
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi,
    replace: "Bearer [REDACTED:BEARER_TOKEN]",
  },
  {
    category: "api_key",
    pattern: /\b(?:pask_[A-Za-z0-9_-]{16}_[A-Za-z0-9_-]{43}|(?:sk|api)[-_][A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/gi,
    replace: "[REDACTED:API_KEY]",
  },
  {
    category: "api_key",
    pattern: /(["']?)(api[_ -]?key)\1\s*([:=])\s*(["'])(.*?)\4/gi,
    replace: (_match, fieldQuote, field, separator) =>
      `${fieldQuote}${field}${fieldQuote}${separator}[REDACTED:API_KEY]`,
  },
  {
    category: "password",
    pattern: /(["']?)(password|passwd|pwd)\1\s*([:=])\s*(["'])(.*?)\4/gi,
    replace: (_match, fieldQuote, field, separator) =>
      `${fieldQuote}${field}${fieldQuote}${separator}[REDACTED:PASSWORD]`,
  },
  {
    category: "password",
    pattern: /(["']?)(password|passwd|pwd)\1\s*([:=])\s*([^\s,;&"']{4,})/gi,
    replace: (_match, fieldQuote, field, separator) =>
      `${fieldQuote}${field}${fieldQuote}${separator}[REDACTED:PASSWORD]`,
  },
];

export function redactCredentials(text: string) {
  const found = new Set<CredentialCategory>();
  let redacted = text;
  for (const rule of replacements) {
    redacted = redacted.replace(rule.pattern, (...args) => {
      found.add(rule.category);
      return typeof rule.replace === "string" ? rule.replace : rule.replace(...args);
    });
  }
  return { text: redacted, categories: [...found].sort() as CredentialCategory[] };
}

export function redactValue<T>(value: T): { value: T; categories: CredentialCategory[] } {
  const categories = new Set<CredentialCategory>();
  const fieldCategory = (key: string): CredentialCategory | null => {
    const normalized = key.toLowerCase().replace(/[_ -]/g, "");
    if (normalized === "apikey") return "api_key";
    if (["password", "passwd", "pwd"].includes(normalized)) return "password";
    if (normalized === "privatekey") return "private_key";
    return null;
  };
  const visit = (item: unknown): unknown => {
    if (typeof item === "string") {
      const result = redactCredentials(item);
      for (const category of result.categories) categories.add(category);
      return result.text;
    }
    if (Array.isArray(item)) return item.map(visit);
    if (item && typeof item === "object") {
      return Object.fromEntries(Object.entries(item).map(([key, child]) => {
        const category = fieldCategory(key);
        if (category && typeof child === "string" && child) {
          categories.add(category);
          return [key, `[REDACTED:${category.toUpperCase()}]`];
        }
        return [key, visit(child)];
      }));
    }
    return item;
  };
  return { value: visit(value) as T, categories: [...categories].sort() as CredentialCategory[] };
}

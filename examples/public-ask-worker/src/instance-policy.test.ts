import assert from "node:assert/strict";
import test from "node:test";
import {
  answerCacheIdentity,
  generationBudgetFallback,
  modelInstructions,
  normalizeLanguage,
  publicMessage,
  resolveInstancePolicy,
} from "./instance-policy.ts";

test("normalizes supported request languages and falls back to the configured default", () => {
  assert.equal(normalizeLanguage("zh-Hans, en;q=0.8"), "zh-CN");
  assert.equal(normalizeLanguage("en-US"), "en");
  assert.equal(normalizeLanguage("fr", "zh-CN"), "zh-CN");
});

test("resolves an instance-specific site, persona, language, and persistence policy", () => {
  const policy = resolveInstancePolicy({
    SITE_URL: "https://demo.example/",
    DEFAULT_LANGUAGE: "en",
    PUBLIC_ASK_PERSONA: "Demo guide",
    PERSIST_INTERACTIONS: "false",
  } as unknown as Env, "zh-CN");
  assert.deepEqual(policy, {
    siteUrl: "https://demo.example",
    siteOrigin: "https://demo.example",
    language: "zh-CN",
    persona: "Demo guide",
    persistInteractions: false,
  });
});

test("defaults to English and persisted interactions", () => {
  const policy = resolveInstancePolicy({ SITE_URL: "https://demo.example" } as unknown as Env);
  assert.equal(policy.language, "en");
  assert.equal(policy.persistInteractions, true);
  assert.match(policy.persona, /evidence-grounded/);
});

test("rejects invalid persistence configuration", () => {
  assert.throws(
    () => resolveInstancePolicy({
      SITE_URL: "https://demo.example",
      PERSIST_INTERACTIONS: "sometimes",
    } as unknown as Env),
    /PERSIST_INTERACTIONS/,
  );
});

test("localizes model instructions and public messages without a production hostname", () => {
  const policy = resolveInstancePolicy({
    SITE_URL: "https://demo.example",
    DEFAULT_LANGUAGE: "en",
  } as unknown as Env);
  const instructions = modelInstructions(policy, "Evidence");
  assert.match(instructions, /https:\/\/demo\.example/);
  assert.doesNotMatch(instructions, /refined-x\.com|你是/);
  assert.equal(publicMessage("en", "requestBudgetExhausted"), "Public Ask has reached its daily request quota.");
});

test("builds a deterministic localized generation-budget fallback", () => {
  const text = generationBudgetFallback("en", [
    { name: "About", url: "https://demo.example/about/" },
    { name: "Projects", url: "https://demo.example/projects/" },
  ]);
  assert.match(text, /no model was called/);
  assert.match(text, /\[About\]\(https:\/\/demo\.example\/about\/\)/);
});

test("isolates answer cache identity by persona, site origin, and language", () => {
  const base = resolveInstancePolicy({
    SITE_URL: "https://demo.example",
    DEFAULT_LANGUAGE: "en",
    PUBLIC_ASK_PERSONA: "Guide A",
  } as unknown as Env);
  const persona = resolveInstancePolicy({
    SITE_URL: "https://demo.example",
    DEFAULT_LANGUAGE: "en",
    PUBLIC_ASK_PERSONA: "Guide B",
  } as unknown as Env);
  const site = resolveInstancePolicy({
    SITE_URL: "https://other.example",
    DEFAULT_LANGUAGE: "en",
    PUBLIC_ASK_PERSONA: "Guide A",
  } as unknown as Env);
  const language = resolveInstancePolicy({
    SITE_URL: "https://demo.example",
    DEFAULT_LANGUAGE: "zh-CN",
    PUBLIC_ASK_PERSONA: "Guide A",
  } as unknown as Env);

  assert.notDeepEqual(answerCacheIdentity(base), answerCacheIdentity(persona));
  assert.notDeepEqual(answerCacheIdentity(base), answerCacheIdentity(site));
  assert.notDeepEqual(answerCacheIdentity(base), answerCacheIdentity(language));
});

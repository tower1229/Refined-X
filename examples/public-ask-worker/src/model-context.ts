import type { NlWebResult } from "./protocol.ts";

const encoder = new TextEncoder();
const MAX_SOURCE_CHARACTERS = 1200;
const MAX_CONTEXT_BYTES = 10 * 1024;

function characters(value: unknown, limit: number) {
  return [...(typeof value === "string" ? value : "")].slice(0, limit).join("");
}

export function buildBoundedModelContext(sources: NlWebResult[]) {
  const compact = sources.slice(0, 8).map((source, index) => ({
    index: index + 1,
    title: characters(source.name, 200),
    url: characters(source.url, 512),
    text: characters(source.description, MAX_SOURCE_CHARACTERS),
  }));
  let serialized = JSON.stringify(compact);
  while (encoder.encode(serialized).byteLength > MAX_CONTEXT_BYTES) {
    const target = compact.reduce((longest, source) =>
      [...source.text].length > [...longest.text].length ? source : longest, compact[0]);
    if (!target?.text) throw new Error("model_context_metadata_too_large");
    const codepoints = [...target.text];
    target.text = codepoints.slice(0, Math.floor(codepoints.length * 0.75)).join("");
    serialized = JSON.stringify(compact);
  }
  return serialized;
}

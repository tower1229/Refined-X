import assert from "node:assert/strict";
import test from "node:test";
import { NO_REFERENCE_ANSWER_VARIANTS, selectNoReferenceAnswer } from "./no-reference-answer.ts";

const APPROVED_VARIANTS = [
  "我在当前公开资料里没有找到足够依据回答这个问题。可以换个更具体的问法，或限定到某篇文章、某个主题再试一次。",
  "这个问题暂时没有可引用的公开资料支撑。我能做的是基于站内已发布内容继续检索，但不会编造作者没有公开表达过的观点。",
  "站内公开内容还不足以回答这个问题。你可以把问题改成更接近文章主题的说法，例如围绕 AI Agent、前端工程或个人知识管理来问。",
  "我没有检索到能支撑结论的公开资料，所以先不强答。给我一个更具体的关键词或文章线索，命中率会更高。",
  "这个问题在现有公开资料中没有足够证据。为了避免误导，我先停在这里；可以继续问一个更窄的问题。",
  "公开资料里暂时看不到明确答案。你可以把问题拆成一个具体主题或时间范围，我会再按站内内容检索。",
  "我没有找到可靠的站内参考来回答它。当前问答只基于 Refined-X 已公开内容，不会用猜测补齐空白。",
  "这个问题可能超出了当前公开语料覆盖范围。换成具体文章、项目、技术方向或作者经历相关的问题，会更容易得到有依据的回答。",
  "现有公开内容不足以形成回答。可以补一个关键词，或问‘有哪些文章提到过这个主题’，我会先帮你找入口。",
  "我暂时找不到足够材料支撑这个答案。为了保持准确，我不会硬凑结论；可以换个角度继续问。",
] as const;

test("no-reference answers are exactly the approved variants", () => {
  assert.deepEqual(NO_REFERENCE_ANSWER_VARIANTS, APPROVED_VARIANTS);
});

test("no-reference selection is injectable and deterministic in tests", () => {
  assert.equal(selectNoReferenceAnswer(() => 0), APPROVED_VARIANTS[0]);
  assert.equal(selectNoReferenceAnswer(() => 0.999999), APPROVED_VARIANTS[9]);
  assert.equal(selectNoReferenceAnswer(() => 1), APPROVED_VARIANTS[9]);
});

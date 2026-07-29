---
title: Can I keep content in an external vault?
description: How Refined-X publishes content stored outside the template.
contentType: answer
slug: external-content-vault
tags: [content, vault, configuration]
llmSummary: Refined-X can use a configurable external contentRoot, allowing content to remain in a separate repository, monorepo, or knowledge vault.
question: Can I keep content in an external vault?
shortAnswer: Yes. Point Refined-X at an external contentRoot through an instance config, and keep the publishing template separate from your source repository or knowledge vault.
---

**Yes.** Configure `contentRoot` in an `instance.config.mjs` overlay, or select that overlay with `REFINED_X_INSTANCE_CONFIG`. The content can remain in a separate repository, monorepo, or knowledge vault while Refined-X acts only as the publishing layer.

You can also configure `publicDir`, `outDir`, and an optional asset source. Keeping instance-specific paths and identity outside the template lets you update Refined-X without moving or overwriting the source content.

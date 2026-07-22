---
title: Configuring an external content root
description: Point the template at any folder that follows the Refined-X public schema.
contentType: article
pubDate: 2026-07-02T10:00:00+00:00
slug: external-content-root
series: building
tags: [refined-x, configuration]
llmSummary: Refined-X loads collections from a configurable contentRoot so a vault or monorepo publish folder can stay outside the site package.
---

Set `contentRoot`, `publicDir`, and `outDir` in `site.config.mjs`, or overlay them from `../instance.config.mjs` when the site is consumed as a git submodule.

The folder shape is opinionated (`articles/`, `answers/`, `profile/`, `projects/`, `series/`), but the **location** of that tree is yours.

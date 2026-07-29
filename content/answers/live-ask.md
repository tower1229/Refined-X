---
title: How does Live Ask work?
description: The optional grounded Ask service and its capability boundaries.
contentType: answer
slug: live-ask
tags: [ask, retrieval, mcp, cloudflare]
llmSummary: Live Ask is an optional sibling Worker that retrieves public site content and can generate source-grounded summaries through restricted browser and MCP interfaces.
question: How does Live Ask work?
shortAnswer: Live Ask is an optional Worker that retrieves this site's public content and can generate source-grounded summaries through restricted browser and MCP interfaces.
---

The site starts with static Ask: exact curated questions and related articles work without a model, database, or runtime service. **Live Ask** is an optional sibling Worker that retrieves the site’s public content and can generate a summary grounded in returned sources.

Its browser interface uses verification, quotas, and rate limits; its MCP interface exposes a restricted `ask` tool. Live Ask does not provide long-term memory, arbitrary external actions, elicitation, or impersonation of the site owner.

---
name: Refined-X
description: 师兄的黑白编辑风个人站；AI 入口带适度科技动感
colors:
  bg: "#ffffff"
  bg-sunken: "#f5f5f3"
  surface: "#ffffff"
  ink: "#161618"
  text: "rgba(22, 22, 24, 0.84)"
  muted: "rgba(22, 22, 24, 0.7)"
  faint: "rgba(22, 22, 24, 0.62)"
  line: "rgba(22, 22, 24, 0.13)"
  line-soft: "rgba(22, 22, 24, 0.07)"
  field: "#ffffff"
  invert-bg: "#161618"
  invert-text: "#fafafa"
  focus: "#005fcc"
  bg-dark: "#0c0c0e"
  ink-dark: "#f3f3f4"
typography:
  display:
    fontFamily: "Spectral, Songti SC, Noto Serif SC, Georgia, serif"
    fontSize: "clamp(32px, 4.8vw, 52px)"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.008em"
  title:
    fontFamily: "Spectral, Songti SC, Noto Serif SC, Georgia, serif"
    fontSize: "22px"
    fontWeight: 500
    lineHeight: 1.3
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, SF Pro Text, PingFang SC, Microsoft YaHei, Noto Sans SC, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.65
  ask-input:
    fontFamily: "{typography.body.fontFamily}"
    fontSize: "clamp(18px, 2.4vw, 22px)"
    fontWeight: 400
    letterSpacing: "-0.012em"
  mono:
    fontFamily: "SF Mono, ui-monospace, JetBrains Mono, Roboto Mono, Menlo, Consolas, monospace"
    fontSize: "11px"
rounded:
  sm: "4px"
  lg: "10px"
  pill: "100px"
spacing:
  wrap-x: "32px"
  section: "64px"
  ask-stage-y: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.bg}"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.pill}"
    padding: "6px 13px"
  ask-field:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "22px 28px"
---

## Overview

**The Monochrome Signal**: a personal editorial site that reads like a carefully typeset notebook, with AI entry points that feel alive but never loud.

Mood: forward-looking engineer, calm desk, high contrast, no color accents. Hierarchy comes from Spectral display type, ink-on-paper contrast, and spacing rhythm. Conversational surfaces (`/ask`, header overlay) may use moderate motion (focus glow, subtle breathe, input feedback) while articles and archives stay static.

Anti-feel: SaaS cream, purple gradients, glass cards, gradient text, hero metrics, corporate carousels, dev-blog clutter, neon Web3.

## Colors

Neutral-only system. Light theme: warm off-white sunken bands (`bg-sunken`), ink text, hairline borders (`line`, `line-soft`). Dark theme inverts via `[data-theme="dark"]` with deep charcoal bases, never pure `#000` / `#fff`.

| Role | Token | Use |
|------|-------|-----|
| Canvas | `bg`, `bg-sunken` | Page ground, ask-stage band |
| Ink | `ink`, `text`, `muted`, `faint` | Hierarchy through opacity |
| Structure | `line`, `line-soft` | Borders, dividers |
| Fields | `field` | Inputs, panels |
| Invert | `invert-bg` / `invert-text` | Primary buttons |
| Focus | `focus` | `:focus-visible` rings |

No chromatic accent in v1. AI "tech" feeling comes from elevation, motion, and scale on ask surfaces, not hue.

## Typography

- **Display / section titles**: Spectral, medium weight, tight tracking on heroes and page headings.
- **Body**: System sans stack, 16px / 1.65, max ~65–75ch in prose.
- **Ask input**: Oversized sans (18–22px), placeholder carries page intent on `/ask`.
- **Meta / machine links**: Mono at 11–13px for agent footers and labels.

Scale contrast between display and body should stay ≥1.25. Avoid flat same-size headings.

## Elevation

Two-tier shadow vocabulary:

- `--shadow`: ambient card lift (panels, results)
- `--shadow-lift`: ask hero, primary conversational block

Flat elsewhere. No nested cards. Ask stage uses full-width sunken band + lifted input, not a card inside a card.

**AI motion (moderate, ask zones only)**

- Focus: 4px ink-tinted outer ring + border snap to `ink`
- Optional: subtle icon opacity transition on focus-within
- Future: light breathe / particle on `/ask` stage only; gate with `prefers-reduced-motion`
- Never animate layout properties (width, height, margin)

## Components

| Component | Notes |
|-----------|-------|
| `.ask` / `.ask-stage` | Signature conversation box; spark icon, large input, solid ink submit |
| `.chip` | Pill outline, muted default, ink border on hover |
| `.icon-btn` | 36×36 chrome actions (spark, theme) |
| `.btn-solid` / `.btn-ghost` | Ink fill vs outline |
| `.answer-index-item` | Full-width FAQ rows, no side stripes |
| `.prose` | Article body, editorial measure |

Header wordmark: Spectral **Refined-X**. User-facing persona: **师兄** (not legal name).

## Do's and Don'ts

**Do**

- Keep monochrome restraint on writing, about, projects, answers index
- Make `/ask` the visual anchor: stage band, shadow-lift, oversized placeholder
- Use spark icon for ask affordances consistently
- Respect keyboard: overlay ⌘K, form submit, chip triggers
- Tint neutrals slightly; use `color-mix` for borders and focus halos

**Don't**

- Add purple/blue brand gradients or SaaS card grids
- Use gradient text, glassmorphism, or hero metric templates
- Put heavy motion on article pages or navigation chrome
- Use left/right accent stripes on list items
- Open modals when inline ask flow suffices
- Use em dashes in UI copy

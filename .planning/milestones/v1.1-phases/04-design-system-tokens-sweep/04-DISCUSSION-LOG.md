# Phase 4: Design System Tokens & Sweep - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-27
**Phase:** 04-design-system-tokens-sweep
**Areas discussed:** Dark highlight fix approach, Login P0 fix (F-25)

---

## Dark Highlight Fix Approach (F-02 — P0)

### Question 1: Visual style in dark mode

| Option | Description | Selected |
|--------|-------------|----------|
| Muted amber glow | Reversed amber pairing: amber-900 bg, amber-200 text | ✓ |
| Soft blue/indigo on dark | Switch to indigo/blue tint matching --button family | |
| You decide | Leave exact values to planner | |

**User's choice:** Muted amber glow (Recommended)

---

### Question 2: Amber depth

| Option | Description | Selected |
|--------|-------------|----------|
| True deep amber bg (~amber-900) | Direct reversal: amber-900 background, amber-200 text | ✓ |
| Very dark neutral with warm tint | Near-black with warm cast, amber-200 text — subtler | |
| You decide | Planner picks hex values, ensure contrast ≥4.5:1 | |

**User's choice:** True deep amber bg (~amber-900 #78350f) (Recommended)

---

### Question 3: Grammar particle tint dark override

| Option | Description | Selected |
|--------|-------------|----------|
| Set a dark-mode value for particle tint too | Explicit separate dark token for grammar particle | |
| Let it inherit from ambient dark treatment | If opacity-derived, fixing parent token is enough | ✓ |
| You decide | Planner decides after reading HighlightedSentence.tsx | |

**User's choice:** Let it inherit from the ambient dark treatment

---

## Login P0 Fix (F-25)

| Option | Description | Selected |
|--------|-------------|----------|
| Phase 4 — fix it here | One-line token fix; resolves P0 gate before Phase 5 | ✓ |
| Phase 5 — defer it | Group with study-session changes | |

**User's choice:** Phase 4 — fix it here (Recommended)

---

## Claude's Discretion

- Exact `--muted` and `--border` hex values in all 3 blocks
- Whether to introduce `--input-bg` as a separate token or map form controls to `bg-surface-1`
- Form control border token: `border-gray-300 dark:border-gray-600` → `border-border` or a specific input border token

## Deferred Ideas

- F-23 (Wrapped hero gradient ignoring `--button`) — Phase 7
- F-10 (`text-green-500` correct-count stat) — Phase 5 if addressed

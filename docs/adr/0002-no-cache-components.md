# ADR 0002 — Next.js Cache Components disabled

**Status:** accepted · **Date:** 2026-11-01

## Context
Next.js 16 scaffolds with `cacheComponents: true`. With it, every read of `cookies()`/`headers()`
outside a `<Suspense>` boundary is a build error. Nearly every Wayfare route reads the session or
the album unlock cookie; the gain of a prerendered static shell is negligible for a private,
access-controlled photo app.

## Decision
`cacheComponents: false` in `next.config.ts`. Routes render dynamically per request.

## Consequences
+ Simpler mental model for contributors; classic dynamic rendering.
− Next.js announced that Cache Components becomes mandatory in the next major. Follow-up issue:
  migrate (landing page and docs-like pages first, then wrap session reads in Suspense).

# ADR 0003 — Cloud photos are imported (copied), not linked

**Status:** accepted · **Date:** 2026-11-01

## Context
Since March 2025 the Google Photos Library API only returns app-created content; user photos can
only be selected via the **Picker API**, whose `baseUrl`s expire after ~60 minutes. Google Drive
without a restricted scope (costly security assessment) only allows `drive.file` + Google Picker.

## Decision
All `PhotoSourceAdapter`s import: picked items are downloaded server-side and run through the same
ingest pipeline as uploads (derivatives, metadata stripping). `sourceRef` is stored for de-duplication.

## Consequences
+ Albums are independent of the source account (revocation, deletion, API changes).
+ Download protection and watermarking work identically for all sources.
− Storage cost; no automatic sync of new photos (follow-up: optional Drive folder sync).

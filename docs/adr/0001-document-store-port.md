# ADR 0001 — One DocumentStore port for SQLite and Firestore

**Status:** accepted · **Date:** 2026-11-01

## Context
Wayfare must run self-hosted (single Docker container) and on Firebase. The two persistence
backends differ fundamentally: SQLite is relational, Firestore is a document store without joins,
with limited query operators and composite-index requirements.

Writing a repository per aggregate *twice* (SQL + Firestore) doubles the surface where the runtimes
can drift apart. Better Auth additionally needs its own adapter per backend.

## Decision
A single generic `DocumentStore` port (`src/server/ports/document-store.ts`) with the lowest
common denominator of both backends: get/put/update/increment/delete, filtered find with sort/limit,
count, updateMany/deleteMany.

- **SQLite:** one table per collection `(id TEXT PRIMARY KEY, data TEXT JSON)`, expression indexes
  on `json_extract(data, '$.field')` for the fields declared in `COLLECTIONS`.
- **Firestore:** one collection per collection; filters pushed down where Firestore supports them,
  sorting in memory when filters are present (avoids composite-index deployment).
- **Better Auth** gets exactly one custom adapter on top of the port.
- The domain model is designed for document access patterns (denormalised fields, counters).

## Consequences
+ One contract, one contract test suite run against both implementations.
+ Schema-less evolution: entities are parsed/defaulted in services, no migrations for v1.
− No referential integrity; cascading deletes are implemented in services.
− In-memory sorting limits very large collections (acceptable: albums ≤ a few thousand photos).
− Postgres is not supported in v1 (follow-up: a Postgres adapter is a third implementation of the same port).

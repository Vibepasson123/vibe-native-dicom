# Traceability Matrix

**Standard:** IEC 62304 §5.1.1 · **Status:** Draft · **Last updated:** 2026-04-26 · **Owner:** Vivek Sah

Links each software requirement to its design, code, and test artifacts. Updated by every PR (CI gate `SR-9001`).

## Conventions

- **Requirement** — `SR-XXXX` from [`62304-requirements.md`](62304-requirements.md).
- **Design** — section reference in [`62304-architecture.md`](62304-architecture.md) (e.g. `arch §3.4`).
- **Code** — file + symbol (e.g. `src/core/readDicom.ts:readDicom`).
- **Test** — file + test name (e.g. `src/__tests__/readDicom.test.ts:reads valid CT`).
- **Risk** — hazard ID from [`14971-hazard-analysis.md`](14971-hazard-analysis.md) (e.g. `H-014`).
- **Status** — Draft / In progress / Verified.

## Matrix

| Requirement | Design | Code | Test | Risk | Status |
| --- | --- | --- | --- | --- | --- |
| SR-9001 | _TBD_ | `scripts/check-traceability.mjs` | `.github/workflows/ci.yml::traceability-gate` | _n/a_ | Draft |
| SR-9002 | _TBD_ | `scripts/check-coverage.mjs` | `.github/workflows/ci.yml::coverage-gate` | _n/a_ | Draft |
| SR-9003 | _TBD_ | `scripts/build-vv-package.mjs` | `.github/workflows/release.yml::vv-package` | _n/a_ | Draft |
| SR-9004 | _TBD_ | `scripts/check-pinned-deps.mjs` | `.github/workflows/ci.yml::pinned-deps` | _n/a_ | Draft |

## Backlinks

For convenience, requirements grouped by code module:

> _To be populated automatically by `scripts/check-traceability.mjs` once Phase 0 complete._

## Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-04-26 | Initial matrix | Vivek Sah |

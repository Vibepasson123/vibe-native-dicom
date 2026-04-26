# Verification Protocol

**Standard:** IEC 62304 §5.6 · **Status:** Draft · **Last updated:** 2026-04-26 · **Owner:** Vivek Sah

## 1. Purpose

Defines how `@viveksah/vibe-native-dicom` is verified — i.e. how we demonstrate that the software meets its requirements ([`62304-requirements.md`](62304-requirements.md)).

## 2. Test types

| Layer | Tool | What it verifies |
| --- | --- | --- |
| Unit (TS) | Jest | Pure functions, public API shape, validators |
| Unit (Swift) | XCTest | Native parsing, math, GDCM/VTK wrappers |
| Unit (Kotlin) | JUnit + Robolectric | Same as Swift, on Android |
| Integration | Custom harness in `example/` app | Turbo Module wiring, end-to-end JS↔native call |
| Cross-platform parity | `parity-tests/` (added Phase 1) | iOS and Android produce byte-identical output for same DICOM input |
| Performance | Benchmarks in `bench/` (added Phase 3) | Decode + render time within published budgets |
| Mutation testing | Stryker (TS), Muter (Swift), Pitest (Kotlin) | Test-suite effectiveness on safety-critical modules |
| Static analysis | TypeScript strict + ESLint + SwiftLint + ktlint + clang-tidy | Type & style compliance |
| Fuzz testing | libFuzzer / Jazzer (Phase 2 onward, on parsers) | Robustness vs. malformed input |

## 3. Coverage targets

- **Overall**: ≥ 80% line coverage (enforced by `SR-9002`).
- **Safety-critical modules** (parsing, W/L, HU conversion, transfer syntax dispatch, pixel decode dispatch, MPR/3D math): **100% line + branch coverage**, with mutation score ≥ 80%.
- Coverage reports collected per-platform and aggregated in the V&V evidence ZIP.

## 4. Test data

All test fixtures live under `fixtures/` and are anonymized public-domain DICOM files. Provenance recorded in `fixtures/PROVENANCE.md` (added Phase 1). Fixtures cover:

- Modalities: CT, MR, X-ray, US, PET, NM, MG, RT.
- Transfer syntaxes: Implicit/Explicit VR LE/BE, JPEG Baseline/Extended/Lossless, JPEG 2000 lossy/lossless, JPEG-LS, RLE, deflate.
- Edge cases: multi-frame, padded, malformed (negative tests).

## 5. Evidence collection

Each release produces a V&V evidence ZIP (`SR-9003`):

- `tests-summary.json` — test pass/fail counts per platform.
- `coverage/` — line/branch coverage HTML reports.
- `mutation/` — mutation test reports.
- `traceability-snapshot.md` — frozen matrix as of the tag.
- `anomalies.md` — open anomalies.
- `fixtures-manifest.txt` — list of fixture files + hashes.

Attached to the GitHub release.

## 6. Re-verification triggers

Per IEC 62304 §5.6.7, full verification re-run on:

- Every release tag.
- Any change to a safety-critical module.
- Any change to a SOUP version.
- Any addition of a new SOUP.
- Any change to a verification tool.

## 7. Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-04-26 | Initial protocol | Vivek Sah |

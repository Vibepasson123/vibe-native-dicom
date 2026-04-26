# Software Requirements Specification (SRS)

**Standard:** IEC 62304 §5.2 · **Status:** Draft · **Last updated:** 2026-04-26 · **Owner:** Vivek Sah

## 1. Purpose

Numbered, testable software requirements for `@viveksah/vibe-native-dicom`. Each requirement has:

- ID (`SR-XXXX`)
- Title
- Description (what the system shall do)
- Rationale / source (why)
- Verification method (how it'll be tested)
- Phase (when it's implemented)
- Status (Draft / Approved / Implemented / Verified)

## 2. ID conventions

- `SR-0xxx` — system-level (functional)
- `SR-1xxx` — performance / non-functional
- `SR-2xxx` — security / privacy
- `SR-3xxx` — usability / API ergonomics
- `SR-9xxx` — process / build / CI

IDs are never reused. Once a requirement is retired it is marked **Obsolete** and kept for history.

## 3. Requirements

> _Filled in iteratively. Phase 0 establishes only process requirements; Phase 1 adds functional requirements._

### Phase 0 — Process & Build Infrastructure

| ID | Title | Description | Rationale | Verification | Phase | Status |
| --- | --- | --- | --- | --- | --- | --- |
| SR-9001 | Traceability gate | CI shall fail any PR touching `src/`, `ios/`, `android/`, `cpp/` whose body or commits do not reference at least one `SR-XXXX` ID and at least one test case ID. | Per IEC 62304 §5.1.1, all changes must trace to a requirement. | CI script unit tests + intentional-failure dry run. | 0 | Draft |
| SR-9002 | Coverage minimums | The build shall reject any release where line coverage on `src/` is below 80% or coverage on safety-critical modules below 100% line + branch. | Class C verification rigor (§5.6). | CI coverage gate test. | 0 | Draft |
| SR-9003 | Release V&V package | Each tagged release shall include a downloadable V&V evidence ZIP containing test results, coverage report, traceability matrix snapshot, and anomaly list as of that tag. | Customer audit support. | Release workflow test. | 0 | Draft |
| SR-9004 | Reproducible build | All third-party native libraries shall be pinned to specific versions documented in `THIRD_PARTY_LICENSES.md`. CI shall fail if an unpinned dependency is added. | SOUP control (§5.3.3). | CI dependency-pin check. | 0 | Draft |

### Phase 1 — Native build infrastructure

> _To be added._

### Phase 2 — DICOM I/O

> _To be added._

### Subsequent phases

> _To be added phase-by-phase._

## 4. Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-04-26 | Initial structure + Phase 0 process requirements | Vivek Sah |

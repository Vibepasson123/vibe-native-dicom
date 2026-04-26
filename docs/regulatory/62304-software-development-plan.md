# Software Development Plan

**Standard:** IEC 62304 §5.1 · **Status:** Draft · **Last updated:** 2026-04-26 · **Owner:** Vivek Sah

## 1. Project information

| Field | Value |
| --- | --- |
| Software name | `@viveksah/vibe-native-dicom` |
| Software type | React Native package — DICOM viewing & I/O component |
| Intended use | Integration into Medical Device Software products by third-party manufacturers |
| Software safety class | **C** (see [`62304-software-safety-class.md`](62304-software-safety-class.md)) |
| Manufacturer of final device | _Not us. Each integrating customer is the regulatory manufacturer for their finished device._ |
| Component supplier | Vivek Sah (sole developer) |

## 2. Lifecycle model

A modified V-model is used for each phase of the [phased roadmap](../PLAN.md#7-phase-roadmap):

```
Requirements ─────────────────────────► Validation
     │                                    ▲
     ▼                                    │
Architecture ──────────────────────► Verification
     │                                    ▲
     ▼                                    │
Detailed design ──────────────► Integration testing
     │                                    ▲
     ▼                                    │
Implementation ───────────► Unit testing
```

Within each phase we use **iterative, short cycles** (≤ 1 week) for implementation. Each iteration produces working code + green tests + updated traceability.

## 3. Roles & responsibilities

Solo dev: all roles assigned to Vivek Sah. Roles re-assigned when team grows.

| Role | Responsibility |
| --- | --- |
| Software Architect | Architecture, classification, dependency choices |
| Software Developer | Implementation in TS / Swift / Kotlin / C++ |
| Verification Engineer | Test design, execution, evidence collection |
| Risk Manager | Hazard analysis, control verification, residual risk |
| Configuration Manager | Git, semver, release notes, V&V evidence packaging |
| Problem Resolution Manager | Triaging anomalies, classifying impact |

## 4. Configuration management

| Concern | Mechanism |
| --- | --- |
| Source control | Git, `main` branch protected, all changes via PR |
| Versioning | SemVer 2.0 (`major.minor.patch`); `release-it` automates tagging |
| Build reproducibility | Pinned versions in `package-lock.json`, native dep versions pinned in `THIRD_PARTY_LICENSES.md` |
| Artifact storage | Each tagged release ships with a V&V evidence ZIP attached to the GitHub release |
| Document version control | All `docs/regulatory/` content tracked in Git; status field in each file |

## 5. Problem resolution process

When a defect is discovered:

1. Filed as a GitHub issue with template `[Defect]`. Assigned a severity (Critical / High / Medium / Low) per [`14971-risk-management.md`](14971-risk-management.md).
2. Defect added to [`anomaly-list.md`](anomaly-list.md) with risk classification.
3. Hazard analysis re-examined. If new hazard, [`14971-hazard-analysis.md`](14971-hazard-analysis.md) updated.
4. Fix implemented under normal SR/test traceability.
5. Anomaly closed in next release notes.

## 6. Software development standards

- TypeScript: `strict: true`, ESLint enforced.
- Swift: Apple Swift API Design Guidelines. SwiftLint (added Phase 1).
- Kotlin: Kotlin coding conventions. ktlint (added Phase 1).
- C++: Google C++ Style Guide. clang-format (added Phase 1).
- Test coverage minimums: **80% line coverage** on `src/`, `ios/`, `android/`. Critical paths (parsing, W/L, HU conversion) require **100% line + branch coverage**.

## 7. Deliverables per phase

Each phase ends with:

1. Updated SRS (Software Requirements Spec)
2. Updated traceability matrix
3. Updated risk file + hazard analysis
4. Verification evidence (tests passing, coverage report)
5. Updated DICOM Conformance Statement (if behavior changed)
6. Updated anomaly list
7. Tagged release on Git
8. Release notes summarizing requirements implemented

## 8. Tooling

| Concern | Tool |
| --- | --- |
| Source control | Git + GitHub |
| Build orchestration | Turbo + npm scripts |
| TS testing | Jest |
| Swift testing | XCTest |
| Kotlin testing | JUnit + Robolectric |
| Coverage | `c8` (TS), Xcode (Swift), JaCoCo (Kotlin) |
| Static analysis | TypeScript strict, ESLint, SwiftLint, ktlint, clang-tidy |
| CI | GitHub Actions |
| Documentation | Markdown + (later) Docusaurus |
| API docs | TypeDoc (auto-generated to `docs/api/`) |

## 9. Plan reviews

This plan is reviewed and re-approved at every phase boundary. Reviews logged in section 10.

## 10. Plan review log

| Date | Reviewer | Phase | Outcome |
| --- | --- | --- | --- |
| 2026-04-26 | Vivek Sah (self-review) | Phase 0 start | Approved |

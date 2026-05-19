# Regulatory Documentation

This folder holds the **IEC 62304** software lifecycle documentation, **ISO 14971** risk management documentation, and the **DICOM Conformance Statement** for `@vibepasson/vibe-native-dicom`.

These documents are intended to be supplied to customers (medical device manufacturers integrating this package) as part of their regulatory submission to FDA / Notified Body / MDR Authority. They MUST stay in sync with the code.

## Scope

This package is software being developed as a **component** for integration into a medical device. Per IEC 62304 §1.4 the package itself is not a finished medical device; the integrating manufacturer assumes the regulatory burden for the final product. We supply documentation so they can.

## Document index

| Document | Standard | Purpose |
| --- | --- | --- |
| [`62304-software-development-plan.md`](62304-software-development-plan.md) | IEC 62304 §5.1 | Defines our development process |
| [`62304-software-safety-class.md`](62304-software-safety-class.md) | IEC 62304 §4.3 | Class C declaration + rationale |
| [`62304-architecture.md`](62304-architecture.md) | IEC 62304 §5.3 | System architecture, decomposition, dependencies |
| [`62304-requirements.md`](62304-requirements.md) | IEC 62304 §5.2 | Software requirements specification (SRS) |
| [`62304-traceability-matrix.md`](62304-traceability-matrix.md) | IEC 62304 §5.1.1 | Requirement → design → code → test linkage |
| [`62304-verification-protocol.md`](62304-verification-protocol.md) | IEC 62304 §5.6 | Verification approach, test types, coverage targets |
| [`62304-validation-protocol.md`](62304-validation-protocol.md) | IEC 62304 §5.7 | Validation in realistic scenarios |
| [`14971-risk-management.md`](14971-risk-management.md) | ISO 14971 | Risk management plan + acceptability criteria |
| [`14971-hazard-analysis.md`](14971-hazard-analysis.md) | ISO 14971 | Hazard list, harm analysis, controls |
| [`conformance-statement.md`](conformance-statement.md) | DICOM PS3.2 | What DICOM the package supports |
| [`anomaly-list.md`](anomaly-list.md) | IEC 62304 §5.6.6 | Known issues with risk classification |
| [`vv-evidence-phase-1.md`](vv-evidence-phase-1.md) | IEC 62304 §5.6 | Phase 1 V&V evidence manifest (frozen 2026-04-28) |

## Update rules

- Every PR that changes behavior touches at least one of: requirements, traceability matrix, hazard analysis, conformance statement.
- Every release ships an updated **Verification Evidence package** — tests run, coverage, anomaly list as of that tag.
- Every code commit body cites a requirement ID (e.g. `Refs SR-074`).
- Every requirement has at least one test linked in the traceability matrix.
- Every hazard has a control measure linked to a requirement.

## Approval workflow

For now (solo dev): all docs are **self-reviewed**. Each doc carries a `Status` field (Draft / Reviewed / Approved). On hiring, this becomes a two-person review.

External regulatory consultant review is planned at the end of Phase 3, 6, and 9 per [`../PLAN.md`](../PLAN.md). Consultant findings recorded in this folder under `consultant-reviews/`.

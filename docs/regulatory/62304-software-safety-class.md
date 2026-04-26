# Software Safety Class Declaration

**Standard:** IEC 62304 §4.3 · **Status:** Draft · **Last updated:** 2026-04-26 · **Owner:** Vivek Sah

## Declaration

This package is classified as **Software Safety Class C** in its entirety.

Class C per IEC 62304 §4.3 means: _"Death or SERIOUS INJURY is possible."_

## Rationale

The package renders, measures, and reformats DICOM medical images that may be used by clinicians for diagnostic decisions. Foreseeable failures include:

- Incorrect Window/Level rendering — could mask a finding (missed diagnosis → harm)
- Incorrect Hounsfield Unit display — could mislead tissue characterization (misdiagnosis → harm)
- Incorrect pixel-spacing application — could falsify a measurement (wrong surgery plan → harm)
- Mis-applied DICOM transfer syntax decoder — could silently corrupt pixel data (incorrect diagnosis → harm)
- Incorrect MPR slice synthesis — could mis-locate anatomy (wrong intervention site → harm)
- Incorrect 3D volume rendering — could mis-represent vasculature or tumors (wrong surgical plan → harm)

For each, the worst-case outcome plausibly includes serious injury or death. Therefore the highest class (C) applies.

We do not subdivide the package into mixed safety classes for v1. All code in `src/`, `ios/`, `android/`, `cpp/` is treated as Class C. We may revisit subdivision (e.g. classifying anonymization or non-rendering utilities lower) once the architecture stabilizes — but only with documented rationale recorded here.

## Implications

Class C requires (IEC 62304 §5):

- Documented requirements at unit level, not just system level.
- Software unit verification with documented evidence.
- Software integration testing with documented evidence.
- Software system testing with documented evidence.
- A defined software change control process tied to risk re-evaluation.

This drives:

- 100% line + branch coverage on safety-critical units (parsing, W/L, HU, transfer syntax dispatch, pixel decode dispatch).
- Mutation testing on those modules (added Phase 1).
- Cross-platform parity tests: iOS and Android must produce byte-identical pixel output for the same DICOM input.
- Every defect triggers a Risk Management File review.

## Review history

| Date | Reviewer | Outcome | Notes |
| --- | --- | --- | --- |
| 2026-04-26 | Vivek Sah (self) | Approved | Initial declaration. To be re-reviewed by external regulatory consultant at Phase 3 checkpoint. |

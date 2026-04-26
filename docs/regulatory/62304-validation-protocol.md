# Validation Protocol

**Standard:** IEC 62304 §5.7 · **Status:** Draft · **Last updated:** 2026-04-26 · **Owner:** Vivek Sah

## 1. Purpose

Defines how `@viveksah/vibe-native-dicom` is validated — demonstrating the software does what it's intended to do in realistic clinical-adjacent scenarios.

> Note: As a software component, full clinical validation is the responsibility of the integrating customer (the regulatory manufacturer). We perform **component-level validation** sufficient for a customer to trust the SDK. Customers run additional validation in their finished device per their own validation plan.

## 2. Validation scenarios

> _Expanded per phase._ Phase 1 only adds build-infra validation.

### Per-phase scenarios

| Phase | Scenario | Pass criteria |
| --- | --- | --- |
| 1 | Build SDK on a clean macOS + clean Linux+Android image; integrate into the example app; call `getGdcmVersion()` from JS | Returns expected GDCM version on both iOS device and Android emulator |
| 2 | Read 100+ real public-domain DICOM files of varied modality/transfer syntax; compare metadata extraction against `gdcmdump` reference | All files parsed; metadata matches reference |
| 3 | Display CT, MR, X-ray sample studies on iOS device + Android device; manually exercise W/L, pan, zoom, stack scroll, presets | Smooth interaction, correct rendering verified by SME against reference viewer |
| 4 | Reproduce known measurements on phantom CT scans (NEMA phantoms) | Linear measurements within ±0.5 mm of phantom ground truth |
| 5 | Reconstruct MPR planes from CT volume; compare against 3D Slicer output | Visual + computational parity within tolerance |
| 6 | Render 3D volume from CT; compare against VTK reference rendering | Visual parity |
| 7+ | _TBD_ | _TBD_ |

## 3. Subject Matter Expert (SME) review

For phases 3+, validation includes review by a clinically-trained SME (radiologist or radiographer). For initial releases, this is contracted (consultant). SME reviews are recorded under `consultant-reviews/`.

## 4. Acceptance criteria

A phase's validation is accepted when:

- All scenario pass criteria are met.
- All anomalies discovered are classified per [`14971-risk-management.md`](14971-risk-management.md). Class C anomalies must be resolved before release; lower-class may carry forward in the anomaly list with documented rationale.
- SME (when applicable) signs off in writing (record in `consultant-reviews/`).
- Updated risk file reviewed.

## 5. Re-validation triggers

- New phase release.
- Any anomaly discovered post-release that affects a previously validated scenario.
- Any change to SOUP that touches a validated scenario.

## 6. Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-04-26 | Initial protocol | Vivek Sah |

# Hazard Analysis

**Standard:** ISO 14971:2019 · **Status:** Draft · **Last updated:** 2026-04-26 · **Owner:** Vivek Sah

Concrete hazards identified for `@viveksah/vibe-native-dicom`. Severity / probability per [`14971-risk-management.md`](14971-risk-management.md).

> Initial pass — expanded as features are added. Each row should evolve through: identified → controls designed → controls implemented → residual risk verified.

## Hazard register

| ID | Hazard | Sequence of events leading to harm | S | P | Initial risk | Controls | Linked req | S' | P' | Residual | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| H-001 | Incorrect Window/Level applied | W/L parameters mis-parsed from DICOM tags → image rendered too dark/bright → finding masked → missed diagnosis | S4 | P3 | H | Per-modality W/L unit tests with reference values; clamp checks; SME validation Phase 3 | _TBD_ | S4 | P1 | M | Identified |
| H-002 | Incorrect Hounsfield Unit displayed | Rescale slope/intercept mis-applied → cursor HU value wrong → tissue mis-characterized | S4 | P3 | H | Unit tests against NEMA phantoms; cross-platform parity test | _TBD_ | S4 | P1 | M | Identified |
| H-003 | Incorrect pixel-spacing in measurement | Pixel-spacing tag mis-parsed → linear measurement off → wrong surgical plan | S4 | P3 | H | Phantom-based validation (Phase 4); explicit rejection if pixel-spacing missing | _TBD_ | S4 | P1 | M | Identified |
| H-004 | Mis-applied transfer syntax decoder | Wrong decoder picked for compressed pixel data → silently corrupted image | S5 | P3 | U | Strict transfer-syntax dispatch with whitelist; fixture coverage per syntax; mutation testing | _TBD_ | S5 | P1 | H | Identified |
| H-005 | Lossy decoding presented without indication | JPEG-lossy compressed file decoded but not flagged → diagnosis on lossy data without awareness | S3 | P4 | H | Always expose `isLossy` boolean alongside pixel data; tests | _TBD_ | S3 | P2 | L | Identified |
| H-006 | Multi-frame frame mis-ordering | Frames returned out of order → cine plays incorrectly → motion artifact misread | S3 | P3 | M | Explicit frame-index test; integration test with multi-frame fixture | _TBD_ | S3 | P1 | L | Identified |
| H-007 | MPR slice axis mis-orientation | Sagittal/coronal plane swapped → anatomical sidedness wrong (left/right) → wrong-side surgery | S5 | P3 | U | Orientation cosines verified per slice; SME validation Phase 5 | _TBD_ | S5 | P1 | H | Identified |
| H-008 | 3D volume opacity transfer-function bug | Tumor or vessel mis-rendered or hidden → wrong intervention plan | S4 | P3 | H | Reference comparison against VTK; SME validation Phase 6 | _TBD_ | S4 | P1 | M | Identified |
| H-009 | Network-fetched study returns stale cache | Customer's user views previous patient's study → privacy breach + diagnosis on wrong data | S4 | P3 | H | Cache key includes Study Instance UID + last-modified; explicit cache-invalidation test | _TBD_ | S4 | P1 | M | Identified |
| H-010 | PHI logged or surfaced in error messages | Patient name/ID appears in crash logs sent to customer's analytics → privacy breach | S3 | P4 | H | Static-analysis rule banning PHI tag values in log calls; redacted-error-message test | _TBD_ | S3 | P1 | L | Identified |
| H-011 | Anonymization profile incomplete | Tag missed during anonymization → PHI leak | S3 | P3 | M | Match DICOM Supp 142 reference list; round-trip test against PHI fixture | _TBD_ | S3 | P1 | L | Identified |
| H-012 | Memory-mapped pixel buffer freed during render | Render reads freed memory → crash in customer app, possible undefined output (corrupted image briefly displayed) | S3 | P3 | M | Explicit lifetime contracts in TypeScript types; AddressSanitizer in CI | _TBD_ | S3 | P1 | L | Identified |
| H-013 | Color image rendered as grayscale or vice-versa | Photometric interpretation mis-handled → image looks normal but loses information | S3 | P3 | M | Photometric-interpretation table tested per fixture | _TBD_ | S3 | P1 | L | Identified |
| H-014 | Big-endian DICOM mis-parsed | Rare big-endian transfer syntax mis-handled → corrupt metadata silently | S4 | P2 | M | Big-endian fixture in test suite; explicit endian dispatch unit tests | _TBD_ | S4 | P1 | L | Identified |
| H-015 | Image flip/rotate mis-applied | Patient orientation lost → left/right confusion | S5 | P3 | U | Orientation tag (`(0020,0020)`) honored; integration test with fixture; SME Phase 3 | _TBD_ | S5 | P1 | H | Identified |
| H-016 | Floating-point precision loss in measurement | Distance computed in float-32 across high-resolution volume → pixel-level error | S2 | P3 | L | Use float-64 for measurements; unit test on edge cases | _TBD_ | S2 | P1 | A | Identified |
| H-017 | DICOMweb auth token logged | Bearer token captured in network logs → security exposure | S3 | P3 | M | Static-analysis rule; redacted-network-log test | _TBD_ | S3 | P1 | L | Identified |
| H-018 | OOM on large studies | Whole-slide pathology DICOM loaded entirely → OOM crash in customer app | S2 | P4 | L | Document max-size limit; refuse files above limit until streaming added Phase 8 | _TBD_ | S2 | P2 | A | Identified |
| H-019 | Concurrent decode causing data race | Two simultaneous decode calls share state → corrupted output | S4 | P3 | H | Native decoders made stateless or per-call instances; ThreadSanitizer in CI | _TBD_ | S4 | P1 | M | Identified |
| H-020 | TLS validation disabled in DICOMweb client | MITM attack delivers wrong study → diagnosis on attacker-supplied data | S5 | P2 | H | TLS validation always on; no opt-out; integration test attempts to disable and asserts rejection | _TBD_ | S5 | P1 | M | Identified |
| H-021 | readDicom returns metadata but unsupported transfer syntax silently substitutes wrong pixel data | Phase 2.1 ships uncompressed support only. If a JPEG / JPEG-2000 / JPEG-LS file were read and the implementation defaulted to "decode as raw" rather than refusing, viewer code would render garbage as the patient image — false positives or missed findings. | S5 | P3 | U | Native helper (`cpp/dicom_read.cpp::isPhase21SupportedSyntax`) whitelists Implicit VR LE + Explicit VR LE for Phase 2.1; on mismatch sets `image.hasPixelData = false` and `pixelDataBase64 = null`. TS contract documents this. Whitelist is expanded explicitly per decoder added in Phase 2.2. Acceptance: a compressed-syntax fixture must return `hasPixelData: false`. | SR-0011 | S5 | P1 | M | Identified |

## Review log

| Date | Reviewer | Outcome | Notes |
| --- | --- | --- | --- |
| 2026-04-26 | Vivek Sah (self) | Initial pass | First 20 hazards identified. To be reviewed and expanded at each phase boundary; external regulatory consultant review at Phase 3, 6, 9 checkpoints. |
| 2026-04-28 | Vivek Sah (self) | Phase 2.1 boundary | Added H-021 (silent pixel-data substitution on unsupported transfer syntaxes) tied to SR-0011. Mitigation implemented in `cpp/dicom_read.cpp` and verified by the example app's round-trip smoke. Existing H-004 / H-014 / H-013 / H-010 also map to SR-0011 via the traceability matrix; no scope changes there. |

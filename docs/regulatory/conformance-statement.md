# DICOM Conformance Statement

**Standard:** DICOM PS 3.2 · **Status:** Draft (skeleton) · **Last updated:** 2026-04-26 · **Owner:** Vivek Sah

This is a structural skeleton. Each section is filled in as the relevant feature lands.

## 1. Introduction

### 1.1 Implementation identity

| Field | Value |
| --- | --- |
| Implementation Name | `vibe-native-dicom` |
| Implementation Version | _matches `package.json#version`_ |
| Manufacturer | Vivek Sah |
| Application | Software component for medical imaging applications |

### 1.2 Scope of this document

This conformance statement describes the DICOM conformance of the `@viveksah/vibe-native-dicom` software component as supplied to integrating customers. Conformance of any finished medical device incorporating this component is the responsibility of the integrating customer.

## 2. Networking

### 2.1 Implementation Model

> _To be completed in Phase 2._ Will document the DICOMweb (QIDO-RS, WADO-RS, STOW-RS) client. DIMSE (C-FIND/MOVE/STORE) is **not** in current scope.

### 2.2 AE specifications

> _N/A — DICOMweb only._

## 3. Media Interchange

### 3.1 Storage media

> _To be completed in Phase 2._ The component reads DICOM files from local storage, network streams, and in-memory byte arrays. Media file IDs (DICOMDIR) parsing planned for Phase 8.

## 4. Supported SOP Classes

> _To be filled phase-by-phase._

| SOP Class UID | Name | Read | Write | Phase |
| --- | --- | --- | --- | --- |
| _TBD_ | _TBD_ | _TBD_ | _TBD_ | _TBD_ |

Common SOP classes targeted: CT Image, MR Image, US Image, Enhanced CT/MR, X-Ray Angiographic Image, Computed Radiography Image, Digital X-Ray Image, Mammography Image, PET Image, Secondary Capture Image, Multi-frame True Color SC, Segmentation Storage, RT Structure Set Storage.

## 5. Supported Transfer Syntaxes

| UID | Name | Read | Write | Phase |
| --- | --- | --- | --- | --- |
| 1.2.840.10008.1.2 | Implicit VR Little Endian | _Phase 2_ | n/a | 2 |
| 1.2.840.10008.1.2.1 | Explicit VR Little Endian | _Phase 2_ | n/a | 2 |
| 1.2.840.10008.1.2.2 | Explicit VR Big Endian (retired) | _Phase 2_ | n/a | 2 |
| 1.2.840.10008.1.2.4.50 | JPEG Baseline (Process 1) | _Phase 2_ | n/a | 2 |
| 1.2.840.10008.1.2.4.51 | JPEG Extended (Processes 2 & 4) | _Phase 2_ | n/a | 2 |
| 1.2.840.10008.1.2.4.57 | JPEG Lossless (Process 14) | _Phase 2_ | n/a | 2 |
| 1.2.840.10008.1.2.4.70 | JPEG Lossless SV1 (Process 14) | _Phase 2_ | n/a | 2 |
| 1.2.840.10008.1.2.4.80 | JPEG-LS Lossless | _Phase 2_ | n/a | 2 |
| 1.2.840.10008.1.2.4.81 | JPEG-LS Lossy (Near-Lossless) | _Phase 2_ | n/a | 2 |
| 1.2.840.10008.1.2.4.90 | JPEG 2000 Lossless Only | _Phase 2_ | n/a | 2 |
| 1.2.840.10008.1.2.4.91 | JPEG 2000 (Lossy or Lossless) | _Phase 2_ | n/a | 2 |
| 1.2.840.10008.1.2.5 | RLE Lossless | _Phase 2_ | n/a | 2 |
| 1.2.840.10008.1.2.1.99 | Deflated Explicit VR LE | _Phase 2_ | n/a | 2 |

## 6. Privacy and Security

> _To be completed._
- TLS for DICOMweb
- No PHI in logs (controlled by hazard H-010)
- Anonymization to DICOM Supp 142 profiles (Phase 8)

## 7. Extensions / Specializations

> _None planned at this time._

## 8. Configuration

> _To be filled per release._ Notes which behaviors are configurable by the integrating customer.

## 9. Anomalies

See [`anomaly-list.md`](anomaly-list.md) for current known issues affecting DICOM conformance.

## 10. Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-04-26 | Initial skeleton | Vivek Sah |

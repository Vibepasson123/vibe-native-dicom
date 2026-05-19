# DICOM Conformance Statement

**Standard:** DICOM PS 3.2 · **Status:** Released for 1.0 · **Last updated:** 2026-05-16 · **Owner:** Vivek Sah

This statement applies to `@vibepasson/vibe-native-dicom` v1.0.0 and later patch releases. Material changes bump the document's status and `Last updated` date and are recorded in §10.

## 1. Introduction

### 1.1 Implementation identity

| Field | Value |
| --- | --- |
| Implementation Name | `vibe-native-dicom` |
| Implementation Version | _matches `package.json#version`_ |
| Manufacturer | Vivek Sah |
| Application | Software component for medical imaging applications |

### 1.2 Scope of this document

This conformance statement describes the DICOM conformance of the `@vibepasson/vibe-native-dicom` software component as supplied to integrating customers. Conformance of any finished medical device incorporating this component is the responsibility of the integrating customer.

## 2. Networking

### 2.1 Implementation Model

The component exposes a DICOMweb client (`DicomWebClient`) implementing the three core services:

- **QIDO-RS** (PS3.18 §10.6) — query for studies / series / instances.
- **WADO-RS** (PS3.18 §10.4) — retrieve instances + metadata + rendered representations.
- **STOW-RS** (PS3.18 §10.5) — store new instances.

DIMSE (C-FIND / C-MOVE / C-STORE) is **not** in scope. Integrators needing classical DICOM networking must layer their own DIMSE stack on top.

### 2.2 AE specifications

N/A — DICOMweb only. No Application Entity is defined or registered by this component.

## 3. Media Interchange

### 3.1 Storage media

The component reads DICOM Part-10 files from arbitrary on-device paths supplied by the consumer (Documents directory, app group containers, file-picker URLs). It does not enumerate storage media itself; that is the host application's responsibility.

Media file IDs (DICOMDIR) parsing is **not** implemented in 1.0.

## 4. Supported SOP Classes

The component is **SOP Class agnostic for parsing**: any well-formed Part-10 file whose transfer syntax appears in §5 can be parsed by `readDicom()` and its pixel bytes extracted by `extractPixelDataToFile()`. The viewer components rely on standard image-IOD attributes (rows / columns / bitsAllocated / pixelRepresentation / photometricInterpretation / windowCenter / windowWidth / rescaleSlope / rescaleIntercept) being present and well-formed.

| SOP Class UID | Name | Read | Write | Notes |
| --- | --- | --- | --- | --- |
| 1.2.840.10008.5.1.4.1.1.2 | CT Image Storage | ✅ | n/a | Primary target. |
| 1.2.840.10008.5.1.4.1.1.4 | MR Image Storage | ✅ | n/a | Primary target. |
| 1.2.840.10008.5.1.4.1.1.6.1 | US Image Storage | ✅ | n/a | Multi-frame supported. |
| 1.2.840.10008.5.1.4.1.1.7 | Secondary Capture Image Storage | ✅ | n/a | |
| 1.2.840.10008.5.1.4.1.1.7.4 | Multi-frame True Color SC | ✅ | n/a | RGB pass-through via viewer's RGBA8 path. |
| 1.2.840.10008.5.1.4.1.1.128 | PET Image Storage | ✅ | n/a | Drives the fusion overlay's "PET" channel. |
| 1.2.840.10008.5.1.4.1.1.481.3 | RT Structure Set Storage | ✅ (contours via `DicomRtStructOverlay`) | n/a | Contour decoding is consumer-side; the overlay renders any polyline list. |
| 1.2.840.10008.5.1.4.1.1.66.4 | Segmentation Storage | ✅ (label-map via `DicomSegmentationOverlay`) | n/a | Label-map decoding is consumer-side; the overlay renders any 8-bit label buffer. |
| 1.2.840.10008.5.1.4.1.1.88.11 | Basic Text SR Storage | ✅ | ✅ (via `exportBasicTextSr`) | Write path is text-only Phase 4.2 export. |

Other SOP classes (Enhanced CT/MR, XA, CR, DX, Mammography, Comprehensive SR, ...) parse provided their transfer syntax is in §5; viewer features may not exercise every IOD-specific attribute.

## 5. Supported Transfer Syntaxes

Negative-control verified end-to-end via `example/src/App.tsx` ("Transfer-syntax round trip" panel + H-021 unsupported-syntax guard).

| UID | Name | Read | Write |
| --- | --- | --- | --- |
| 1.2.840.10008.1.2 | Implicit VR Little Endian | ✅ | ✅ |
| 1.2.840.10008.1.2.1 | Explicit VR Little Endian | ✅ | ✅ |
| 1.2.840.10008.1.2.4.50 | JPEG Baseline (Process 1) | ✅ (lossy) | ✅ |
| 1.2.840.10008.1.2.4.51 | JPEG Extended (Processes 2 & 4) | ✅ (lossy) | ✅ |
| 1.2.840.10008.1.2.4.57 | JPEG Lossless (Process 14) | ✅ | ✅ |
| 1.2.840.10008.1.2.4.70 | JPEG Lossless SV1 (Process 14) | ✅ | ✅ |
| 1.2.840.10008.1.2.4.80 | JPEG-LS Lossless | ✅ | ✅ |
| 1.2.840.10008.1.2.4.81 | JPEG-LS Near-Lossless | ✅ (lossy) | ✅ |
| 1.2.840.10008.1.2.4.90 | JPEG 2000 Lossless Only | ✅ | ✅ |
| 1.2.840.10008.1.2.4.91 | JPEG 2000 (Lossy or Lossless) | ✅ (lossy) | ✅ |
| 1.2.840.10008.1.2.5 | RLE Lossless | ✅ | ✅ |

Explicitly NOT supported in 1.0:

- Explicit VR Big Endian (retired in PS3.5).
- Deflated Explicit VR Little Endian.
- MPEG / MPEG-4 / HEVC video transfer syntaxes.

Unsupported transfer syntaxes are reported via `isSupportedTransferSyntax()` and `extractPixelDataToFile()` returns `hasPixelData: false` with an empty `filePath` rather than substituting undefined bytes — see hazard H-021.

## 6. Privacy and Security

- **TLS for DICOMweb** — the `DicomWebClient` uses the platform `fetch`; consumers configure TLS via the URL scheme (`https://`) and the host platform's trust store. The library does not pin certificates.
- **No PHI in logs** — controlled by hazard H-010. Library log statements never include PHI fields; the consumer is responsible for the same discipline in their own log surface.
- **Anonymization** — `anonymizeDataset()` / `anonymizeDicomFile()` implement a pragmatic subset of DICOM PS3.15 §E.1 (Basic Application Confidentiality Profile): D / Z / X / U / K actions on patient, study, series, institution, and SOP identifiers, plus deterministic UID remapping via `UidRemapper`. Pixel-data burnt-in PHI scrubbing (OCR / image inspection) is **not** implemented; integrators handling images with burnt-in PHI must layer their own pixel pass.

## 7. Extensions / Specializations

None. The library does not define private SOP classes, private transfer syntaxes, or private DataElements. All emitted UIDs use either the official DICOM root (`1.2.840.10008.*`) for standard elements or `2.25.*` (the registered local UID root) for `UidRemapper`-minted anonymous identifiers.

## 8. Configuration

Per-feature configuration points exposed to integrators:

- **Pixel-data cache** — `PixelDataCache({maxBytes, maxEntries})`. Defaults: 256 MiB / 512 entries.
- **Series prefetcher** — `SeriesPrefetcher({concurrency, onItemError})`. Default concurrency 2.
- **Volume render presets** — `VOLUME_RENDER_PRESETS` (CT bone / CT angio / MR brain / gray 8-bit); consumers may also assemble bespoke `VolumeRenderOptions` directly.
- **Hanging protocols** — `HANGING_PROTOCOLS` (single / CT 2-up / prior/current / PET-CT fusion); consumers can declare their own `HangingProtocol` matchers.
- **Anonymization** — `AnonymizationOptions` (`dummyPatientName`, `dummyPatientId`, `keepDescriptions`, custom `UidRemapper`).
- **Output-path strategy** — `useVolumeRenderController({outPathBuilder})` accepts a custom builder for sandboxed filesystems.

## 9. Anomalies

See [`anomaly-list.md`](anomaly-list.md). At 1.0 release: one open anomaly (`A-002`, jest-worker SIGSEGV intermittent under coverage, tooling-only); no open class-B or class-C anomalies affecting runtime conformance.

## 10. Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-04-26 | Initial skeleton | Vivek Sah |
| 2026-05-16 | Released for 1.0 — populated §2–§9 with as-shipped content (DICOMweb client, supported SOP classes, 11 transfer syntaxes verified, PS3.15 anonymization, configuration map). | Vivek Sah |

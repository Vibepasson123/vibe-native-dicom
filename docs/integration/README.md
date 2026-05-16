# Integration Guide

Customer-facing documentation. Targeted at the engineers integrating `@viveksah/vibe-native-dicom` into their React Native medical device application.

## Available now

- [`getting-started.md`](getting-started.md) — install, peer requirements, the first slice end-to-end, phase capability map.
- [`api-overview.md`](api-overview.md) — every public export, grouped by phase, with a pointer at its canonical source file.

## Coming with later phases

- `permissions.md` — iOS/Android permissions for file/network access.
- `viewer-component.md` — `<DicomImageViewSkia />` deep-dive: props, gestures, multi-frame.
- `mpr-volume-component.md` — orthogonal + oblique MPR + slab projection + volume render in one place.
- `tools.md` — measurement & annotation tools usage.
- `dicomweb-client.md` — DICOMweb networking (QIDO / WADO / STOW).
- `anonymization.md` — anonymization profiles and customization.
- `performance-tuning.md` — caching, prefetching, memory budgets.
- `safety-information.md` — known limits, required customer-side controls (per ISO 14971 §7).
- `regulatory-package.md` — what's in the V&V evidence ZIP and how to use it in a submission.
- `migration/` — version-to-version migration notes.

Until those land, the example app under [`example/src/App.tsx`](../../example/src/App.tsx) demonstrates every phase's component in isolation — and is the canonical reference for the unfinished sections.

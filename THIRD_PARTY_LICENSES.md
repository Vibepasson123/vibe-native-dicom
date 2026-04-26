# Third-Party Licenses

This file documents every third-party software library bundled, linked into, or distributed with `@viveksah/vibe-native-dicom`. It satisfies:

1. The **attribution requirements** of each library's open-source license (BSD, MIT, Apache, MPL — all permissive, all require we preserve copyright + license text).
2. The **IEC 62304 §5.3.3 SOUP inventory** requirement (cross-referenced from [`docs/regulatory/62304-architecture.md`](docs/regulatory/62304-architecture.md) §4).
3. **Customer audit readiness** — medical device manufacturers integrating this package include this file in their MDR / FDA / Notified Body submission to declare the software bill of materials.

## How this file is maintained

- Every entry is **pinned to an exact version** (no `^`, `~`, `*`). Version bumps require a PR that updates this file.
- Each entry includes the **verbatim license text** copied from the upstream source tree at the pinned version.
- Adding or removing a library follows AGENTS.md §6.3 (SOUP discipline): updates here, in the SOUP inventory, and a hazard-analysis review.
- This file ships with the package on npm — see `files` in `package.json` (added Phase 1).

---

## 1. GDCM (Grassroots DICOM)

| Field | Value |
| --- | --- |
| Library | Grassroots DICOM (GDCM) |
| Version | _TBD — pinned in Phase 1_ |
| License | BSD-3-Clause |
| Source URL | https://sourceforge.net/projects/gdcm/ · https://github.com/malaterre/GDCM |
| Used for | DICOM parsing, transfer-syntax handling, DICOMweb client primitives |
| First introduced | Phase 1 |
| SOUP inventory entry | [`docs/regulatory/62304-architecture.md`](docs/regulatory/62304-architecture.md) §4 |

### License text

> _Filled in when the library is vendored in Phase 1. The verbatim BSD-3-Clause license from the pinned GDCM release will be pasted here._

---

## 2. libjpeg-turbo

| Field | Value |
| --- | --- |
| Library | libjpeg-turbo |
| Version | _TBD — pinned in Phase 2_ |
| License | Tri-license: IJG (libjpeg) + BSD-3-Clause + zlib |
| Source URL | https://libjpeg-turbo.org/ · https://github.com/libjpeg-turbo/libjpeg-turbo |
| Used for | JPEG Baseline / Extended / Lossless decode of compressed DICOM pixel data |
| First introduced | Phase 2 |
| SOUP inventory entry | [`docs/regulatory/62304-architecture.md`](docs/regulatory/62304-architecture.md) §4 |

### License text

> _Filled in when the library is vendored in Phase 2. All three license texts (IJG, BSD-3-Clause, zlib) from the pinned libjpeg-turbo release will be pasted here._

---

## 3. OpenJPEG

| Field | Value |
| --- | --- |
| Library | OpenJPEG |
| Version | _TBD — pinned in Phase 2_ |
| License | BSD-2-Clause |
| Source URL | https://github.com/uclouvain/openjpeg |
| Used for | JPEG 2000 (lossy + lossless) decode of compressed DICOM pixel data |
| First introduced | Phase 2 |
| SOUP inventory entry | [`docs/regulatory/62304-architecture.md`](docs/regulatory/62304-architecture.md) §4 |

### License text

> _Filled in when the library is vendored in Phase 2. The verbatim BSD-2-Clause license from the pinned OpenJPEG release will be pasted here._

---

## 4. CharLS

| Field | Value |
| --- | --- |
| Library | CharLS |
| Version | _TBD — pinned in Phase 2_ |
| License | BSD-3-Clause |
| Source URL | https://github.com/team-charls/charls |
| Used for | JPEG-LS (lossless + near-lossless) decode of compressed DICOM pixel data |
| First introduced | Phase 2 |
| SOUP inventory entry | [`docs/regulatory/62304-architecture.md`](docs/regulatory/62304-architecture.md) §4 |

### License text

> _Filled in when the library is vendored in Phase 2. The verbatim BSD-3-Clause license from the pinned CharLS release will be pasted here._

---

## 5. VTK (The Visualization Toolkit)

| Field | Value |
| --- | --- |
| Library | VTK |
| Version | _TBD — pinned in Phase 5_ |
| License | BSD-3-Clause |
| Source URL | https://vtk.org/ · https://github.com/Kitware/VTK |
| Used for | Multi-Planar Reconstruction (MPR), 3D volume rendering, transfer functions |
| First introduced | Phase 5 |
| SOUP inventory entry | [`docs/regulatory/62304-architecture.md`](docs/regulatory/62304-architecture.md) §4 |

### License text

> _Filled in when the library is vendored in Phase 5. The verbatim BSD-3-Clause license from the pinned VTK release will be pasted here._

---

## 6. Eigen

| Field | Value |
| --- | --- |
| Library | Eigen |
| Version | _TBD — pinned in Phase 4_ |
| License | MPL-2.0 (with optional BSD modules — we use only MPL-licensed components) |
| Source URL | https://eigen.tuxfamily.org/ · https://gitlab.com/libeigen/eigen |
| Used for | Linear algebra and geometry math for measurement / annotation tools |
| First introduced | Phase 4 |
| SOUP inventory entry | [`docs/regulatory/62304-architecture.md`](docs/regulatory/62304-architecture.md) §4 |

### License text

> _Filled in when the library is vendored in Phase 4. The verbatim MPL-2.0 license from the pinned Eigen release will be pasted here._

> **MPL-2.0 note:** unlike BSD/MIT/Apache, MPL-2.0 has a "file-level copyleft" requirement — any direct modifications we make to MPL-licensed Eigen files must be published under MPL-2.0. We **do not modify Eigen** in our integration; we use it as-is via header includes only. If a future change requires modification, that file becomes MPL-2.0 in our tree as well, and this note is updated.

---

## Package itself

`@viveksah/vibe-native-dicom` is licensed under MIT — see [`LICENSE`](LICENSE).

---

## Change history

| Date | Change |
| --- | --- |
| 2026-04-26 | Initial skeleton with placeholder entries for GDCM, libjpeg-turbo, OpenJPEG, CharLS, VTK, Eigen |

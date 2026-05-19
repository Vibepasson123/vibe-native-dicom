# Third-Party Licenses

This file documents every third-party software library bundled, linked into, or distributed with `@vibepasson/vibe-native-dicom`. It satisfies:

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
| Version | **v3.2.5** (commit `dacccb6c04ee13f6958359c193f804358f4672d7`) |
| License | BSD-3-Clause (modified — third clause names specific contributors) |
| Source URL | https://github.com/malaterre/GDCM/tree/v3.2.5 |
| Vendored at | `third_party/gdcm/` (git submodule) |
| Used for | DICOM parsing, transfer-syntax handling, dataset I/O. DICOMweb client primitives in Phase 2. |
| First introduced | Phase 1 (commit hash to be filled in once Phase 1.2 lands) |
| SOUP inventory entry | [`docs/regulatory/62304-architecture.md`](docs/regulatory/62304-architecture.md) §4 |

### Bundled dependencies note

GDCM v3.2.5 internally bundles copies of several other open-source libraries (OpenJPEG, libjpeg, JPEG-LS / CharLS, expat, zlib, LIBUUID, etc.) under `third_party/gdcm/Utilities/`. In Phase 1 we build GDCM with its bundled copies enabled (`GDCM_USE_SYSTEM_*=OFF`), so the resulting XCFramework / shared library contains code from those bundled libraries. Their individual licenses live alongside the source in `third_party/gdcm/Utilities/<lib>/Copyright*` files. Phase 2 of the project replaces bundled OpenJPEG / libjpeg / CharLS with directly-pinned, repository-managed copies; once that lands, each gets its own dedicated section in this file.

### License text

```
/*=========================================================================

  Program: GDCM (Grassroots DICOM). A DICOM library

Copyright (c) 2006-2016 Mathieu Malaterre
Copyright (c) 1993-2005 CREATIS
(CREATIS = Centre de Recherche et d'Applications en Traitement de l'Image)
All rights reserved.

Redistribution and use in source and binary forms, with or without
modification, are permitted provided that the following conditions are met:

 * Redistributions of source code must retain the above copyright notice,
   this list of conditions and the following disclaimer.

 * Redistributions in binary form must reproduce the above copyright notice,
   this list of conditions and the following disclaimer in the documentation
   and/or other materials provided with the distribution.

 * Neither name of Mathieu Malaterre, or CREATIS, nor the names of any
   contributors (CNRS, INSERM, UCB, Universite Lyon I), may be used to
   endorse or promote products derived from this software without specific
   prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS ``AS IS''
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE AUTHORS OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

=========================================================================*/
```

Source: [`third_party/gdcm/Copyright.txt`](third_party/gdcm/Copyright.txt) at tag v3.2.5.

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

`@vibepasson/vibe-native-dicom` is licensed under MIT — see [`LICENSE`](LICENSE).

---

## Change history

| Date | Change |
| --- | --- |
| 2026-04-26 | Initial skeleton with placeholder entries for GDCM, libjpeg-turbo, OpenJPEG, CharLS, VTK, Eigen |
| 2026-04-26 | GDCM filled in: v3.2.5 (commit dacccb6c0) vendored as `third_party/gdcm/`. Verbatim Copyright.txt pasted. Bundled-dependency note added flagging GDCM-Utilities libs that ride along until Phase 2 replaces them. |

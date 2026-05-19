# AGENTS.md

Project rules for AI coding agents (Claude Code, Cursor, Codex, etc.) and human contributors. **Same rules apply to both.**

This package is **diagnostic-use medical software** supplied as a component to medical-device manufacturers who hold the regulatory clearance. We follow **IEC 62304** (software lifecycle), **ISO 14971** (risk management), and **DICOM PS 3.2** (conformance) from day one. Process discipline is mandatory.

If anything in this file conflicts with [`docs/PLAN.md`](docs/PLAN.md) or [`docs/regulatory/`](docs/regulatory/), the regulatory documents take precedence — update AGENTS.md to match, never the other way around.

---

## 1. Project Overview

| Field | Value |
| --- | --- |
| Package | `@vibepasson/vibe-native-dicom` (monolithic, MIT, npm) |
| Purpose | Diagnostic-grade DICOM viewing & I/O React Native component (parsing, decoding, 2D/MPR/3D viewing, measurement tools, DICOMweb) |
| Intended use | Integrated into medical device software products by third-party manufacturers. We are the **component supplier**; the integrator is the regulatory manufacturer. |
| License | MIT |
| Software Safety Class | **C** per IEC 62304 §4.3 — see [`docs/regulatory/62304-software-safety-class.md`](docs/regulatory/62304-software-safety-class.md) |
| Consumers | Bare React Native apps. Not an Expo module. Must be installable in Expo bare workflow projects via autolinking. |

---

## 2. Tech Stack (non-negotiable)

| Layer | Choice |
| --- | --- |
| Language (JS) | **TypeScript**, strict mode on |
| iOS native | **Swift** behind a thin Obj-C++ shim (codegen requires Obj-C++ for the spec; Swift holds the real logic) |
| Android native | **Kotlin** (Java only when bridging requires it) |
| Native cross-platform | **C++17** for shared logic and JNI/Obj-C++ glue |
| Architecture | **New Architecture** — Turbo Modules + Fabric (codegen-based) |
| RN version | **Latest stable** (0.85+ baseline; track latest at all times) |
| Node | LTS (20.x or 22.x) |
| Package mgr | **npm** project-wide. Do not introduce Yarn or pnpm. `.npmrc` sets `legacy-peer-deps=true` to match the resolution behavior the scaffolder's dep set was tested under — do not remove without verifying the full ESLint plugin matrix supports strict resolution. |
| Scaffolder | `create-react-native-library` (Callstack) — defaults overridden where the regulatory plan demands |
| Example app | Bare React Native (NOT Expo) |

Native libraries (SOUP) used as the foundation — see [`docs/regulatory/62304-architecture.md`](docs/regulatory/62304-architecture.md) §4 for full inventory:

- **GDCM** (BSD-3-Clause) — DICOM parsing & I/O
- **libjpeg-turbo** (BSD/IJG/zlib) — JPEG decode
- **OpenJPEG** (BSD-2-Clause) — JPEG 2000 decode
- **CharLS** (BSD-3-Clause) — JPEG-LS decode
- **VTK** (BSD-3-Clause) — 3D / MPR rendering
- **Eigen** (MPL-2.0) — geometry math

Do not introduce alternatives without following §6.3 (SOUP discipline).

---

## 3. Repository Layout

```
.
├── src/                                  TypeScript public API + Turbo Module spec
│   ├── core/                             Parsing & I/O public types
│   ├── viewer/                           Fabric view components (2D, MPR, 3D)
│   ├── tools/                            Measurement & annotation
│   ├── windowing/                        Presets, LUTs, HU conversion
│   └── anonymize/                        DICOM Supp 142 anonymization
├── ios/                                  Swift + Obj-C++ + native libs
├── android/                              Kotlin + JNI + native libs
├── cpp/                                  Cross-platform C++ helpers
├── example/                              Bare RN demo app
├── lib/                                  Build output (gitignored)
├── docs/
│   ├── PLAN.md                           Canonical implementation plan
│   ├── regulatory/                       IEC 62304 + ISO 14971 + DICOM PS3.2
│   ├── architecture/                     Internal design docs
│   ├── integration/                      Customer-facing integration guide
│   ├── guides/                           End-developer how-tos
│   └── api/                              Auto-generated TypeDoc
├── fixtures/                             Public-domain DICOM test data
├── AGENTS.md                             This file
├── README.md
├── CHANGELOG.md
├── THIRD_PARTY_LICENSES.md
├── package.json
├── tsconfig.json
└── VibeNativeDicom.podspec
```

Agents must not invent new top-level folders without updating this file.

---

## 4. Coding Conventions

### TypeScript
- `strict: true`. No `any` unless justified with a `// reason:` comment that cites a hazard or limitation.
- Public API lives in `src/index.ts`. Anything not exported there is private.
- Prefer named exports. No default exports for modules.
- Use `unknown` over `any` at boundaries.
- Validate every Turbo Module return at the TS boundary before exposing it as the typed public API.

### Swift (iOS)
- Swift 5.9+, follow Swift API Design Guidelines.
- Real logic in Swift; Obj-C++ files are thin shims that delegate via the auto-generated `<Module>-Swift.h` header.
- Use `@objc public final class` for classes exposed to the Obj-C++ layer; nothing else should leak.
- One Turbo Module class per file.
- Use `Result` / `throws` over completion handlers with error params, unless the codegen contract requires the latter.
- No force-unwraps (`!`) outside of tests.

### Kotlin (Android)
- Kotlin 1.9+, follow Kotlin coding conventions.
- One Turbo Module class per file.
- Use coroutines for async work; expose to JS via Promises.
- No `!!` (non-null assertion) outside tests.
- Min SDK aligned with current RN baseline (24+ unless DICOM deps force higher).

### C++
- C++17. Google C++ Style Guide. `clang-format` mandatory (added Phase 1).
- No exceptions across the JNI / Obj-C++ boundary — convert to error codes/objects at the boundary.
- Always pass DICOM byte buffers as `std::span<const uint8_t>` or equivalent — never raw pointers without length.

### Comments
- Default to **no comments**. Self-documenting names first.
- Add a comment only when the *why* is non-obvious — DICOM tag rationale, hazard reference (`// hazard: H-014`), spec quirk, or workaround for a specific bug.
- Never write comments that narrate *what* the code does or reference task/PR numbers.

---

## 5. New Architecture Rules

- All native modules MUST be Turbo Modules (codegen-driven).
- All native UI components MUST be Fabric components.
- The JS spec file is the source of truth for the native interface — regenerate codegen after every spec change.
- Do not add Old Architecture–only fallbacks. If something cannot be expressed in codegen, raise it before implementing.

---

## 6. Regulatory Process Rules (MANDATORY)

This is the most important section. Violations block merge.

### 6.1 Traceability

Every code change to `src/`, `ios/`, `android/`, `cpp/` MUST:

1. Reference at least one `SR-XXXX` requirement ID from [`docs/regulatory/62304-requirements.md`](docs/regulatory/62304-requirements.md) in the commit body (e.g. `Refs SR-074`).
2. Include or update at least one test case that exercises the requirement.
3. Update [`docs/regulatory/62304-traceability-matrix.md`](docs/regulatory/62304-traceability-matrix.md) linking req → code → test.
4. Update [`docs/regulatory/14971-hazard-analysis.md`](docs/regulatory/14971-hazard-analysis.md) if the change introduces, alters, or mitigates a hazard.
5. Update [`docs/regulatory/conformance-statement.md`](docs/regulatory/conformance-statement.md) if the change alters DICOM behavior (transfer syntaxes, SOP classes, services).

CI enforces (1) via `SR-9001`. Manual review enforces (2)–(5).

### 6.2 New requirements

To add a new requirement:

1. Append to [`docs/regulatory/62304-requirements.md`](docs/regulatory/62304-requirements.md) with an unused `SR-XXXX` ID — never reuse an ID.
2. Choose ID range per category: `0xxx`=functional, `1xxx`=performance, `2xxx`=security/privacy, `3xxx`=usability/API, `9xxx`=process/build/CI.
3. Add an entry in the traceability matrix immediately, even if status is `Draft`.
4. Cross-reference any related hazards.

### 6.3 SOUP (Software Of Unknown Provenance)

Adding any third-party native library or runtime dependency requires:

1. Updating `THIRD_PARTY_LICENSES.md` with library name, version, license, source URL, intended use.
2. Adding an entry to the SOUP inventory in [`docs/regulatory/62304-architecture.md`](docs/regulatory/62304-architecture.md) §4 with known hazards and mitigations.
3. Pinning to an exact version (no `^`, `~`, `*` for SOUP).
4. Adding a hazard line to [`docs/regulatory/14971-hazard-analysis.md`](docs/regulatory/14971-hazard-analysis.md) if the SOUP introduces new risk.

CI enforces version-pinning via `SR-9004`.

### 6.4 Software Safety Class

The whole package is Class C. Do not subdivide or downgrade without:

1. Rationale documented in [`docs/regulatory/62304-software-safety-class.md`](docs/regulatory/62304-software-safety-class.md).
2. Review by maintainer (currently solo dev — self-review allowed but recorded in the doc's review log).

### 6.5 V&V Evidence

Each tagged release must ship a V&V evidence ZIP per `SR-9003`. Releases without complete V&V evidence are rejected.

### 6.6 PHI handling (linked to hazard H-010)

- NEVER log Protected Health Information (PHI) — patient name, ID, DOB, accession, etc. — at any log level.
- NEVER include PHI in error messages, crash reports, telemetry, or stack traces.
- NEVER include PHI in tests, fixtures, or repo contents.
- NEVER include PHI in commit messages or PR descriptions.

A static-analysis check enforcing this is planned in Phase 1.

### 6.7 Lossy operations (linked to hazard H-005)

Any operation that may discard image fidelity (lossy decode, downsampling, format conversion) MUST:

1. Be reflected in a returned `isLossy: true` flag on the public API.
2. Be documented in the customer integration guide as an integration-relevant fact.

---

## 7. DICOM-Specific Rules

- Treat all DICOM data as untrusted input. Validate tag structure before dereferencing.
- Heavy parsing and decoding belong in native code (Swift/Kotlin/C++), not JS.
- Use **GDCM** as the parsing/IO library. **libjpeg-turbo + OpenJPEG + CharLS** for compressed pixel data. **VTK** for 3D / MPR. Do not introduce alternative DICOM libraries without a full §6.3 SOUP review.
- Do not use a JS-only parser as the primary path. JS parsers introduce unknown decode behavior and a duplicate code path that's a regulatory liability.
- Honor pixel-spacing, orientation, and rescale tags strictly. These are linked to hazards H-002, H-003, H-007, H-015. Do not silently default them.
- The DICOM Conformance Statement is a living document. Update it before merging behavior changes.

---

## 8. Testing Discipline (Class C)

| Concern | Requirement |
| --- | --- |
| Overall coverage | ≥ 80% line coverage on `src/`, `ios/`, `android/`, `cpp/` |
| Safety-critical modules | **100% line + branch coverage** (parsing, transfer-syntax dispatch, pixel decode, W/L, HU conversion, MPR/3D math, orientation handling) |
| Mutation testing | ≥ 80% mutation score on safety-critical modules |
| Cross-platform parity | iOS and Android MUST produce byte-identical output for the same DICOM input. Asserted by parity tests. |
| Fixtures | Anonymized, public-domain DICOM only. No PHI. Provenance tracked in `fixtures/PROVENANCE.md`. |
| Negative tests | Every parser path needs malformed-input fuzz tests |
| Integration tests | Native modules need at least one integration test invoked from the example app |
| Bridge mocking | Never mock the native bridge in tests that exist to verify the bridge |

---

## 9. Build & Tooling Commands

```bash
# Install
npm install

# Build TS
npm run prepare

# Lint
npm run lint

# Typecheck
npm run typecheck

# Test
npm test

# Run example (iOS)
npm run example:ios

# Run example (Android)
npm run example:android

# Start Metro for example
npm run example:start
```

Agents must update this section when commands are added or changed.

---

## 10. Commits & PRs

- **Conventional Commits**: `feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`, `build:`, `ci:`.
- One logical change per commit. Squash-merge to main.
- **Every commit body** that changes code in `src/|ios/|android/|cpp/` MUST include `Refs SR-XXXX` citing at least one requirement ID. CI enforces this.
- PR title = top-line change. PR body = *why*, not *what*.
- Never `--no-verify`, never `--force` to main.
- Bump version + CHANGELOG via `release-it` only; never edit `version` in `package.json` by hand.

---

## 11. What Agents MUST NOT Do

- Do not commit secrets, API keys, **real patient data**, or **unredacted DICOM files**.
- Do not add dependencies (especially native SOUP) without following §6.3.
- Do not bypass codegen by writing parallel hand-written native interfaces.
- Do not introduce Expo SDK dependencies.
- Do not downgrade RN, TypeScript, Swift, or Kotlin versions to "make something work." Fix the root cause.
- Do not run destructive git commands (`reset --hard`, `push --force`, branch deletes) without explicit user approval.
- Do not create README/docs/markdown files unless explicitly asked.
- Do not change the software safety class without rationale recorded in `62304-software-safety-class.md`.
- Do not merge code that fails the traceability gate (`SR-9001`).
- Do not log PHI under any circumstances (§6.6).
- Do not disable TLS validation in network code (linked to hazard H-020).
- Do not introduce JS-only DICOM parsing as the primary path.
- Do not introduce hand-rolled DICOM transfer-syntax decoders that duplicate GDCM/libjpeg-turbo/OpenJPEG/CharLS — extending or wrapping their existing functionality is the only acceptable path.
- Do not delete or substantially rewrite this file without explicit user approval.

---

## 12. When in Doubt

Stop and ask. This package is on the path to being part of a cleared diagnostic medical device. The cost of an unsafe assumption is real-world harm to a patient. Prefer a clarifying question over a guess. Record the answer in the appropriate doc.

# V&V Evidence Collection Protocol

**Standard:** IEC 62304 §5.6 · **Requirement:** [SR-9003](62304-requirements.md) · **Owner:** Vivek Sah

This document describes the automated mechanism that produces a single, dated, content-addressed evidence bundle from a verification run. Bundles live in [`docs/regulatory/vv-evidence/`](./vv-evidence/) and are committed alongside the change set that produced them at phase-freeze time.

## 1. Purpose

A regulatory reviewer (62304 / FDA / IEC 14971) needs to reconstruct **what was verified, when, and against which version of the code** for any release. Free-form prose phase manifests (such as the existing [`vv-evidence-phase-1.md`](vv-evidence-phase-1.md)) handle the human narrative; this protocol covers the machine record.

Per `SR-9003`:

> A full release-grade V&V evidence package — coverage HTML, mutation reports, test summaries — is implemented in Phase 9.

Phase 9.1 ships the **collector**. Subsequent phases (9.2+) layer coverage HTML, mutation reports, and real-fixture image tests on top of the same bundle directory.

## 2. Running the collector

| Command | Purpose |
| --- | --- |
| `npm run vv:collect` | JS suite only — typecheck, lint, jest. Fast (≈30 s). |
| `npm run vv:collect:all` | JS suite **plus** Android `:app:assembleDebug` and iOS `xcodebuild`. ~5–10 min. |
| `node scripts/collect-vv-evidence.mjs --android` | JS suite + Android only. |
| `node scripts/collect-vv-evidence.mjs --ios` | JS suite + iOS only. |

The script never aborts on a step failure — every step is captured into the bundle even if some failed. The process exit code is `0` iff every step passed, so CI gates on it cleanly.

## 3. Bundle layout

Each invocation writes to:

```
docs/regulatory/vv-evidence/<ISO-date>-<short-sha>/
    manifest.json           — structured record (schema "vv-evidence/1")
    manifest.md             — human-readable rendering of manifest.json
    typecheck.txt           — full tsc --noEmit output
    lint.txt                — full eslint output (src + example)
    jest.txt                — full jest --ci output
    android-assemble.txt    — gradle :app:assembleDebug output (if --android)
    ios-xcodebuild.txt      — xcodebuild output (if --ios)
    git-status.txt          — `git status` at collection time
    git-log-recent.txt      — `git log -25 --oneline`
```

`manifest.json` contains:

- **`git`** — full + short HEAD SHA, branch, commit message + date, `git describe --tags`, working-tree-clean flag.
- **`tooling`** — Node, npm, Xcode, and the *configured* (not detected) Android NDK from `android/build.gradle`.
- **`steps`** — array of `{label, command, exitCode, ms, passed, outFile}` for every step that ran.
- **`jestStats`** — parsed `{suitesPassed, suitesTotal, testsPassed, testsTotal}` so downstream tooling doesn't have to re-grep.
- **`fileHashes`** — SHA-256 of every captured log file, so a reviewer can detect post-hoc edits.

## 4. When to run

- **Phase freeze:** every phase-level commit listed in [`docs/PLAN.md`](../PLAN.md) §10 produces a bundle on the same commit (run before committing or amend the bundle in).
- **Release tag:** every `git tag` for a versioned release runs the `--all` variant and the resulting bundle accompanies the release.
- **CI on PR:** the JS-only variant runs in CI; the bundle is uploaded as a CI artifact, not committed.

## 5. Reproducibility caveats

- **Working tree must be clean.** The collector warns (but does not refuse) when it isn't; a dirty bundle is a debugging artifact, not an audit artifact.
- **Native toolchains drift.** Xcode and the Android NDK versions are recorded in `manifest.json` — same NDK is enforced via `android/build.gradle`, but Xcode is whatever the host has. A release bundle MUST be produced on a known macOS / Xcode combination listed in [`62304-verification-protocol.md`](62304-verification-protocol.md).
- **Bundle directory is not gitignored.** Bundles are intentionally checked in for the phase-freeze cases. Day-to-day development bundles should be discarded before commit.

## 6. Schema versioning

`manifest.json` carries a `schema` field (currently `"vv-evidence/1"`). Future-incompatible changes bump the schema and add a migration note here. Tooling that parses bundles MUST check the schema field and reject unknown versions rather than silently misread.

## 7. Change history

| Date | Change | Commit |
| --- | --- | --- |
| 2026-05-15 | Initial protocol — Phase 9.1 collector ships. | (this commit) |

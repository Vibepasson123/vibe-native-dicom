# Documentation — `@vibepasson/vibe-native-dicom`

This folder contains all documentation for the package. Everything here is **plain Markdown**, version-controlled with the code, and ready to be published as a static site (Docusaurus / VitePress / GitHub Pages) when we choose.

## Structure

```
docs/
├── README.md                       # this file
├── PLAN.md                         # full implementation plan (phases, library stack, file layout)
├── regulatory/                     # IEC 62304, ISO 14971, DICOM Conformance Statement
├── architecture/                   # system + module design docs
├── api/                            # auto-generated TypeDoc output (later)
├── integration/                    # customer-facing integration guide
└── guides/                         # how-to articles, tutorials
```

| Folder | Audience | Updated |
| --- | --- | --- |
| `regulatory/` | Customers' regulatory teams, auditors | Every PR that touches behavior |
| `architecture/` | Internal devs, customer engineering teams | Each phase boundary |
| `api/` | Consumers of the package | Generated on each release |
| `integration/` | Customer engineers integrating the SDK | Each public API change |
| `guides/` | End users (devs writing apps) | Anytime |

## Authoring conventions

- Plain Markdown only. No HTML unless absolutely necessary.
- One topic per file. Long pages split into linked sub-pages.
- File names: lowercase, kebab-case. Acronyms in standards (`62304`, `14971`) stay numeric.
- Internal links use relative paths so they survive a future site generator.
- Every document starts with: title (H1), short summary (1–3 lines), then content.
- For regulatory docs, include a status block at the top: `**Status:** Draft / Reviewed / Approved · **Last updated:** YYYY-MM-DD · **Owner:** <name>`.
- Date format throughout: `YYYY-MM-DD`.

## Publishing (future)

When we're ready to publish, the recommended stack is:

1. **Docusaurus 3** — React-based, used by Cornerstone3D, OHIF, dcmjs. Best fit for an SDK with a large API surface and versioned docs.
2. **VitePress** — leaner, faster, Vue-based. Great if we want minimal tooling.
3. **GitHub Pages with raw Markdown** — zero tooling, works immediately. Acceptable for an early private release.

We'll add the chosen tool's config (e.g. `docusaurus.config.js`) at the **package root**, not inside `docs/`, so the markdown remains tool-independent.

## Templates

When creating a new doc, copy the closest existing file as a template. Don't invent new section orderings without updating this README.

# Risk Management Plan

**Standard:** ISO 14971:2019 · **Status:** Draft · **Last updated:** 2026-04-26 · **Owner:** Vivek Sah

## 1. Scope

This Risk Management File covers the software component `@viveksah/vibe-native-dicom`. Component-level risks are documented here; system-level risks for the finished medical device remain the integrating customer's responsibility.

## 2. Process

We follow ISO 14971's iterative cycle:

1. **Hazard identification** — what could go wrong? Recorded in [`14971-hazard-analysis.md`](14971-hazard-analysis.md).
2. **Risk analysis** — for each hazard, identify the sequence of events leading to harm, severity, and probability.
3. **Risk evaluation** — compare against acceptability criteria (§3 below).
4. **Risk control** — implement risk-control measures (design, protective measures, information for safety).
5. **Residual risk evaluation** — verify acceptable after controls.
6. **Overall residual risk acceptability** — judged at each release boundary.

The process is run:

- At each new feature.
- On every defect discovered.
- At every release.
- On every SOUP version change.

## 3. Severity & Probability scales

### Severity

| Score | Label | Description |
| --- | --- | --- |
| S1 | Negligible | No harm; cosmetic. |
| S2 | Minor | Reversible inconvenience; no medical consequence. |
| S3 | Serious | Reversible injury; possible misdiagnosis with rapid recovery. |
| S4 | Critical | Permanent injury; misdiagnosis leading to wrong treatment. |
| S5 | Catastrophic | Death. |

### Probability

| Score | Label | Description |
| --- | --- | --- |
| P1 | Improbable | Once per 10⁶ uses or rarer |
| P2 | Remote | 10⁻⁵ to 10⁻⁶ per use |
| P3 | Occasional | 10⁻⁴ to 10⁻⁵ |
| P4 | Probable | 10⁻³ to 10⁻⁴ |
| P5 | Frequent | More than 10⁻³ |

## 4. Risk acceptability matrix

|       | P1 | P2 | P3 | P4 | P5 |
| ---   | -- | -- | -- | -- | -- |
| **S5** | M  | H  | H  | U  | U  |
| **S4** | L  | M  | H  | H  | U  |
| **S3** | L  | L  | M  | H  | H  |
| **S2** | A  | A  | L  | L  | M  |
| **S1** | A  | A  | A  | A  | A  |

| Code | Meaning |
| --- | --- |
| A | Acceptable as-is |
| L | Low — track, no action required |
| M | Moderate — apply controls if reasonable |
| H | High — controls REQUIRED before release |
| U | Unacceptable — do not release |

## 5. Risk control approaches

In priority order per ISO 14971 §7:

1. **Inherently safe design** — eliminate the hazard. (E.g. refusing to render unsupported transfer syntaxes rather than guessing.)
2. **Protective measures in the SDK** — sanity checks, range guards, fail-fast on invalid input.
3. **Information for safety** — warnings to the integrating customer, documentation of assumptions and limits.

## 6. Residual risk acceptability

Each hazard's residual risk (after controls) must be in the **A**, **L**, or **M** zone. **H** or **U** residual risk blocks release.

Overall residual risk evaluated at each release. Sign-off recorded in [`14971-hazard-analysis.md`](14971-hazard-analysis.md) review log.

## 7. Information for safety (customer-facing)

Each release ships a "Safety Information" section in the customer integration guide listing:

- Known limits (e.g. max image dimensions tested, supported transfer syntaxes).
- Required customer-side controls (e.g. customer must validate their UI integration of W/L controls).
- Required runtime warnings the SDK emits.

## 8. Change history

| Date | Change | Author |
| --- | --- | --- |
| 2026-04-26 | Initial plan | Vivek Sah |

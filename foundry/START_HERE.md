# Foundry handoff

Use the [product execution guide](PRODUCT-EXECUTION.md) and [P01–P60 backlog](PRODUCT-BACKLOG.tsv) for new work. The earlier briefs below document the repository baseline. This directory is not a native Foundry import and does not mean any Foundry agent has run. The platform/provider is intentionally unspecified.

Read ../AGENTS.md and ../docs/ARCHITECTURE.md. Use one owner and one branch/worktree per task. A handoff contains exact commit SHA, changed files, commands actually run, observed results, limitations and API/schema/deployment impact. Independent review inspects the author's exact SHA. Never fabricate a model trace or PASS.

| Task | Owner | Deliverable | Gate |
|---|---|---|---|
| AUTH-01 | APP | Named-user Supabase Auth and guest-to-account migration | Two-user/guest isolation, no ownership escalation, real auth test |
| SCENE-02 | GEO | Optional planar Scene v1 import and OBJ export implemented. See [handoff](../docs/HANDOFF.md) | Preserve full polygon containment and ENU mapping |
| GEO-03 | GEO | Address/imagery adapter and calibrated tracing into the planar scene contract | Provenance, editable outlines and 10-address case protocol |
| UI-02 | WEB (review: UX) | Direct obstacle manipulation and roof polygon editing with command history | Desktop/mobile interaction tests and visual review |
| CAT-01 | APP (review: OPT) | Versioned manufacturer catalog, coverage vs external dimensions, allowed orientations | Real datasheet sources and dimensional fixtures |
| PV-01 | PV | Offline pvlib baseline on a documented weather fixture | UTC, night, leap year, energy accounting and independent references |
| AI-01 | APP (review: LEAD) | Typed design-exploration tools, then a model adapter | Bounded calls/tokens, actual traces, draft changes before apply |
| ML-01 | ML (review: GEO) | Reproducible roof-mask experiment on licensed imagery, local inference | Dataset IDs/license, held-out split, measured error cases, no Railway GPU |

AUTH-01 and SCENE-02 precede multi-customer data and complex geometry. CAT-01 and PV-01 can proceed on fixture-only branches. Runtime AI may call only stable deterministic tools. Training frameworks and model weights do not belong in the 250 MB Railway image.

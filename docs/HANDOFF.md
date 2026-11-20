# Project handoff

Start with [release evidence](RELEASE.md), [architecture](ARCHITECTURE.md) and [Foundry assignments](../foundry/START_HERE.md). The canonical production target is [production-target.json](production-target.json). Main can contain newer commits than Railway. Compare the pinned SHA against GET /api/health before making claims about a live feature.

## Code and contracts

| Concern | Entry point | Invariant |
|---|---|---|
| Scene input | server/models.py, contracts/scene.schema.json | Scene v1, metric units, stable obstacle IDs |
| Layout | server/geometry.py, POST /api/layout | Full module rectangles inside legal surface, deterministic grid phases, hash of scene |
| 3D | web/src/SceneView.tsx | ENU maps to (E,U,-N), layout positions use surface U/V |
| Editor | web/src/App.tsx | Local edits and cloud revisions are distinct, exports exclude stale results |
| Cloud | server/app.py, supabase/migrations/ | X-Workspace-Key bearer capability, RLS through PostgREST, expected_revision compare-and-swap |
| Delivery | Dockerfile, railway.json, .github/workflows/ | One service, 250 MB and 0.1 vCPU, sleeping, exact tested SHA |

Cloud history uses GET /api/projects/{id}/revisions for metadata and GET /api/projects/{id}/revisions/{revision} for a saved scene. Creating or changing a project captures the snapshot in the same DB transaction. The newest 20 snapshots are retained and cascade when their project is deleted. Existing rows start history at their current revision. Stale writes return 409 without creating a snapshot. In the editor, open **Projekty → Historia projektu → Wczytaj rewizję**. Loading changes the local draft. Explicit save appends a new revision against the cloud head observed at load time, so concurrent changes after that read still cause a 409. Uncommitted local changes trigger a confirmation before loading. A failed load leaves the draft in place.

### Revision API example

For a project saved at revisions 1 and 2, the history endpoint returns metadata ordered as [2, 1]. The item endpoint returns the original scene as saved in revision 1. Loading revision 1 and saving with expected_revision=2 creates revision 3. The browser smoke verifies the prior load has no cloud side effect. Cloud tests also verify history isolation and stale writes. A missing or foreign history list is empty, and a missing or foreign item returns 404.

Migration 20261120163403_project_revision_history.sql is applied to the existing Supabase project. It backfills the current head and installs an AFTER trigger for snapshot capture. The parent project's row policy governs history visibility. Clients have SELECT only on history. Test and production environments use the same schema contract; neither requires a service-role key in the app.

## Planar scenes and interoperability

Scene v1 accepts optional custom_surfaces alongside the original gable adapter. See [schema](../contracts/scene.schema.json) and [worked roof/facade example](../web/src/example-planes.json). Surface IDs are stable strings. Each plane supplies a local ENU origin in metres, orthonormal U/V axes, an exterior UV ring and optional interior rings. The normal is the right-hand cross product U × V. Orient the axes so that the normal points outward. Use surfaces to select which planes receive modules. Obstacles are associated with a surface ID. The planar import assumes input surfaces describe distinct building faces. It validates each polygon and its holes independently. The scene is bounded to six surfaces, 250 m² of selected polygon area, and 600 m² of selected UV bounding boxes to limit computation.

POST /api/scene/validate returns a normalized scene with defaults. POST /api/layout returns the resolved planes, both variants and evidence hash. The legacy field roof_area_m2 is the selected polygon area, including selected facades and excluding holes. POST /api/model.obj accepts scene and an optional variant of landscape or portrait. It returns a mesh in metres, X=East, Y=Up, Z=−North. Surface groups preserve the holes, and module groups preserve the checked placement. OBJ is a surface model and remains open at unmodelled walls. The snapshot/export format still uses scene schema v1 and guest project history requires no database migration for this feature. Imported vertices are edited in the source JSON at this stage.

Open **Eksport → Wczytaj przykład dachu i fasady** to see the sample. The **Model 3D OBJ** export uses the active layout. To reproduce the test packet, use the [local instructions](ROOF-TEST-PACK.md) and build it with python scripts/package_roof_tests.py dist/BIPV-Roof-Tests.zip. GitHub Actions checks the extracted ZIP and keeps it as an artifact.

See the [Electrotile requirements and rollout matrix](ELECTROTILE-DELIVERY.md) for acceptance thresholds, dependencies and module gaps.

## Pick up the work

1. Named-user access. Design account ownership alongside guest ownership. Add an explicit one-time claim to an authenticated account and test two accounts, two guest keys, repeat claims and revocation. Keep guest support until migration UX passes.
2. Image-driven geometry. Connect a licenced address/imagery source and interactive calibrated tracing. Convert UV rings to the existing plane contract. Retain source and uncertainty. Add checks for overlap between imported building faces and preserve old scenes.
3. Manufacturer data and energy. Use datasheet-backed coverage dimensions and allowed orientations. Validate offline pvlib on recorded weather with time zone and energy accounting fixtures. Keep shadow preview distinct from numerical shading.
4. Reconstruction and AI. Record image license, source, calibration and held-out reference cases. Run training/inference outside Railway. Wire bounded typed assistant tools to existing geometry APIs after contracts are stable. Persist actual tool traces and apply only approved draft edits.

## Release checklist

- Run frozen uv and npm installs, Ruff, pytest, TypeScript build, Chromium and Docker smoke. Use the commands in the README.
- Run a targeted live cloud test for migrations or cloud API changes. Its fixtures must clean up and must never reuse a real workspace key.
- Apply backward-compatible DDL to the existing Supabase project before promoting dependent code. Record the actual remote migration version if the management API chooses its timestamp.
- Pin the passing application commit on Railway, read deployment status and confirm health SHA. Update production-target.json to trigger production verification. Link both run IDs from the release entry.
- Revert application code by pinning the previously verified commit. Keep additive tables in place until a separately reviewed migration has proved safe. An app rollback does not undo DB writes.

Canonical project handles: GitHub maciejbrasewicz/bipv-blueprint, Railway bipv-blueprint / production / bipv-studio, Supabase bipv-blueprint. Resolve projects by identity before mutating. Runtime credentials belong in Railway variables, and workspace keys belong in the originating browser.

### Agent workflow

Choose an owner from the Foundry task list and open a branch from main. Keep each change small enough to review independently. Record scope, acceptance cases, changed contracts, tests that actually ran, exact commit SHA and rollback steps in the pull request. Review migrations separately when they change ownership or permissions. Use the current production target to distinguish verified deployment from newer code on main.

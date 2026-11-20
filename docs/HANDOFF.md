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

Cloud history uses GET /api/projects/{id}/revisions for metadata and GET /api/projects/{id}/revisions/{revision} for a saved scene. Creating or changing a project captures the snapshot in the same DB transaction. The newest 20 snapshots are retained and cascade when their project is deleted. Existing rows start history at their current revision. Stale writes return 409 without creating a snapshot. There is no history editor yet. A future restore action should take a saved scene and write a new revision using the current expected_revision.

## Pick up the work

1. UI history. Add revision list to the existing project dialog, read a selected snapshot and compare it, then allow restore as a fresh save. Cover current project vs local unsaved draft and 409 recovery.
2. Named-user access. Design account ownership alongside guest ownership. Add an explicit one-time claim to an authenticated account and test two accounts, two guest keys, repeat claims and revocation. Keep guest support until migration UX passes.
3. Free-form surface contract. Add metric polygons and holes alongside the current gable adapter. Verify ENU round trip, invalid shapes, non-overlap and complete containment. Keep old saved scenes readable.
4. Manufacturer data and energy. Use datasheet-backed coverage dimensions and allowed orientations. Validate offline pvlib on recorded weather with time zone and energy accounting fixtures. Keep shadow preview distinct from numerical shading.
5. Reconstruction and AI. Record image license, source, calibration and held-out reference cases. Run training/inference outside Railway. Wire bounded typed assistant tools to existing geometry APIs after contracts are stable. Persist actual tool traces and apply only approved draft edits.

## Release checklist

- Run frozen uv and npm installs, Ruff, pytest, TypeScript build, Chromium and Docker smoke. Use the commands in the README.
- Run a targeted live cloud test for migrations or cloud API changes. Its fixtures must clean up and must never reuse a real workspace key.
- Apply backward-compatible DDL to the existing Supabase project before promoting dependent code. Record the actual remote migration version if the management API chooses its timestamp.
- Pin the passing application commit on Railway, read deployment status and confirm health SHA. Update production-target.json to trigger production verification. Link both run IDs from the release entry.
- Revert application code by pinning the previously verified commit. Keep additive tables in place until a separately reviewed migration has proved safe. An app rollback does not undo DB writes.

Canonical project handles: GitHub maciejbrasewicz/bipv-blueprint, Railway bipv-blueprint / production / bipv-studio, Supabase bipv-blueprint. Resolve projects by identity before mutating. Runtime credentials belong in Railway variables, and workspace keys belong in the originating browser.

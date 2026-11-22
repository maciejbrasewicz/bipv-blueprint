# Project handoff

Use the [product roadmap](PRODUCT-ROADMAP.md) and [Foundry execution guide](../foundry/PRODUCT-EXECUTION.md) for new work. See [release evidence](RELEASE.md) and [architecture](ARCHITECTURE.md) for the existing implementation. The canonical production target is [production-target.json](production-target.json). Main can contain newer commits than Railway. Compare the pinned SHA against GET /api/health before making claims about a live feature.

## First product implementation

- **P01** adds versioned Pydantic contracts and generated JSON Schema under `contracts/`. Scene v2 embeds Scene v1 in `geometry`, with an optional WGS84 reference origin and per-surface evidence. Call the existing layout and export with `v2.geometry`. Existing guest scenes and revisions use Scene v1. Measured evidence needs a source ID; a verified catalog needs source references. Job v1 is a validation contract for P10.
- Regenerate the schema snapshots with `uv run python -m scripts.sync_product_contracts`. Tests compare snapshots and exercise invalid evidence, catalog dimensions and job results. The ET roof test archive includes a fixed subset of files.
- The organizations migration creates private RLS-enforced tables for organizations and members. It expands the schema while keeping current guest data and grants unchanged. The subsequent organization access migration enables named project access and claims. Apply them in order. CI exercises guest history before and after the migration in a disposable PostgreSQL database.
- **P02** adds synthetic local ENU and UV fixtures for a sloped roof with a recess, opening and obstacle, and a facade with a window. The fixture manifest records area calculations, normals and exclusion rectangles. Real building measurements, imagery rights, source catalog and historical quotes are pending.

## Organization workspaces

- The account drawer uses named Supabase Auth email/password accounts provisioned for the pilot. An authenticated user creates an organization, opens its project list and can move the current saved guest project into an organization they can edit. Project revisions, identity and update time are preserved.
- Account responses contain no Auth tokens. The server keeps the access token in a same-origin HttpOnly cookie until it expires, up to one hour. The user signs in again after expiry. Organization scenes and references are held in memory; guest scenes retain their existing browser persistence. Users with unsaved organization edits get a prompt when switching from that workspace or signing out.
- Read access is driven by current membership. Owners and designers may update projects. Owners may delete projects. The pilot operator provisions accounts in Supabase Auth and sets membership in `bipv_private.organization_members` using the user UUID and organization UUID. The owner role is granted during creation. Deleting a membership revokes access for the existing token. Invitations and their administration can use this data model as onboarding expands.
- `X-Organization-Id` selects the organization for the existing project API. The guest key identifies only the guest workspace except when both credentials are used in the claim endpoint. Organization authorization uses the token and RLS. The claim checks the expected guest revision and serializes ownership changes. A replay to the same organization returns the same project ID.
- Private bucket `bipv-project-assets` permits access by project membership on paths `<organization_id>/<project_id>/<file>`. Upload UI, validation and lifecycle remain part of P15. Rollback to the earlier runtime restores the guest interface; keep both migrations in place and deploy the named runtime again to open already-moved projects.

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

POST /api/scene/validate returns a normalized scene with defaults. POST /api/layout returns the resolved planes, both variants and evidence hash. The legacy field roof_area_m2 is the selected polygon area, including selected facades and excluding holes. POST /api/model.obj accepts scene and an optional variant of landscape or portrait. It returns a mesh in metres, X=East, Y=Up, Z=−North. Surface groups preserve the holes, and module groups preserve the checked placement. OBJ is a surface model and remains open at unmodelled walls. Scene v1 stays the compute and OBJ input. Scene documents in project snapshots and portable JSON can contain v1 or v2.

### P07 · edit openings and preserve the scene document

- Import plain Scene v1/v2 JSON or the existing project export envelope. POST /api/scene/v2/validate checks the complete v2 document. The editor uses its nested geometry for layout and export.
- Open **Rzut 2D**, select an opening, pick a vertex and enter U/V in metres. The server checks the candidate polygon before the editor records one undo step. In 3D, the outline of the selected opening is highlighted on its plane.
- A geometry correction marks the affected surface evidence unverified and retains source references. Undo restores the previous rings and status. While layout recalculates, the canvas shows the previous geometry without module placements. Current-result metrics and derived exports wait for a response for the current input.
- Apply migration `20261121094820_allow_scene_v2_documents.sql` before enabling cloud writes from this release. It expands the existing project JSON check and preserves revision history and RLS. Database regression checks confirm that v1 history and v2 provenance can be read by the owning organization. Older builds expect v1 project heads. Keep a v2-capable build available to read or export new v2 revisions during a rollback. Leave the additive constraint in place for new v2 rows.

Open **Eksport → Wczytaj przykład dachu i fasady** to see the sample. The **Model 3D OBJ** export uses the active layout. To reproduce the test packet, use the [local instructions](ROOF-TEST-PACK.md) and build it with python scripts/package_roof_tests.py dist/BIPV-Roof-Tests.zip. GitHub Actions checks the extracted ZIP and keeps it as an artifact.

See the [Electrotile requirements and rollout matrix](ELECTROTILE-DELIVERY.md) for acceptance thresholds, dependencies and module gaps.

## P09 · address and building selection

Open **Lokalizacja budynku**, search a Polish address and select an EGiB footprint. The map supports 120, 240 and 480 m squares. At the larger scales, zoom into the selected outline to trace its roof using the detailed image. Selecting **Potwierdź budynek** creates an undoable Scene v2 draft from that footprint, including internal rings and separate polygon parts when present. The scene retains the building reference, local ENU origin and estimated provenance. The map derives the footprint from EGiB and the model assumes a 6 m height and horizontal roof. Existing roof trace tools allow the user to refine the geometry on imagery. Above the 250 m² layout limit or the search bounds budget, Studio renders the footprint with layout disabled. The local model supports footprints of up to 79 m span subject to the planar geometry contract.

- `GET /api/geo/sources` identifies GUGiK sources, the lookup CRS and the retention policy. The raw address search, alternative addresses and building footprint responses are retained only for the dialog. The user-confirmed project reference follows the project's existing local or cloud revision lifecycle.
- `POST /api/geo/addresses` uses GUGiK UUG. `POST /api/geo/buildings` queries the WFS EGiB buildings layer for an EPSG:2180 bounding box and returns candidates within the chosen 60, 120 or 240 m radius. UUG returns easting/northing. WFS 2.0 GML uses northing/easting for EPSG:2180. PROJ gives the selected reference point in WGS84.
- If an expanded window at the same map center returns a partial response, the dialog retains known footprints and the current selection. It merges by building ID and prefers the fresh outline for overlapping results. A complete result or a different window center uses the new response directly. The dialog continues to indicate partial coverage.
- Input validation, a 14 s deadline, a 512 KiB bound, at most two concurrent upstream lookups and 30 lookups per minute limit the impact on the existing service. The UI distinguishes empty coverage, a partial set and provider failure. `BIPV_GEODATA_ENABLED=0` disables outward geodata lookups while preserving local editing and import.
- EGiB building IDs and geometry are covered by the access provision in Art. 40a(2)(1)(j). The adapter queries those public attributes. This path uses no aerial or satellite imagery. [GUGiK UUG](https://services.gugik.gov.pl/uug/opis.html) · [GUGiK WFS EGiB](https://mapy.geoportal.gov.pl/wss/service/PZGIK/EGIB/WFS/UslugaZbiorcza) · [Dz.U. 2026 poz. 1389](https://www.dziennikustaw.gov.pl/D2026000138901.pdf)

## P11 · georeferenced orthophoto preview

After finding an address with a building footprint, select **Pokaż ortofotomapę**. The overlay shares the EGiB coordinate frame. **Zmierz odległość** calculates the horizontal grid distance between two points on the map. The displayed pixel spacing is the nominal spacing of the requested raster, independent of provider ground resolution and roof accuracy.

- `POST /api/geo/orthophoto` accepts the selected EPSG:2180 grid point. It requests a 600 × 600 PNG for the surrounding 120 × 120 m square. WMS 1.3.0 uses northing/easting in BBOX. The JSON contract names the west, south, east and north bounds explicitly. It reports the provider, CRS, grid spacing, retrieval time and SHA-256 of the original PNG.
- The adapter uses the shared 14 s deadline and request budget. The raster path accepts at most 1.5 MB upstream. PNG dimensions and integrity of its chunks are checked on the server. The browser handles undecodable or transparent images and preserves the selected EGiB building on failure.
- The preview and two-point measurement live in the location dialog. The saved project still records the selected site only. Source kind is `orthophoto`, separate from the satellite-only tender scenario. [GUGiK ORTO and terms of use](https://www.geoportal.gov.pl/pl/dane/ortofotomapa-orto/)

## P12 · trace to an estimated roof

Select the building, show its orthophoto and open **Obrysuj dach**. Add the corners in perimeter order. Select a numbered point and click the replacement position, or use **Usuń punkt**. Enter the assumed height and apply the outline. This replaces the current roof surfaces and obstacles as one undoable scene change. It preserves the product and layout clearances.

- `POST /api/scene/from-orthophoto` creates a Scene v2. The backend rejects invalid rings, repeated vertices, out-of-raster coordinates, an unrelated building and excess area. It converts EPSG:2180 offsets into the WGS84 local east/north tangent frame anchored at the outline midpoint. The specified height is relative to the assumed local ground level. OBJ exports the evaluated planes in the usual metric axes.
- The estimated surface carries the image SHA-256, retrieval time, building ID, grid origin, original clicked points and entered elevation in `surface_evidence[].orthophoto_trace`. The PNG itself stays in the dialog. Reopening the same building with the same extent and image SHA can restore the editable points.
- Flat traces still produce one horizontal surface. The Scene v2 schema accepts older records. A rollback to code that predates this optional field requires compatibility for projects already saved with trace provenance.

## P13 · two roof planes from a traced ridge

After preparing the outline, choose **Dwuspadowy**, click two points on the ridge line, and enter the ridge height and one pitch for both sides. The line is extended to the outline. An off-centre ridge can produce different eave heights. The server checks that it divides the outline into two roof planes with an unbroken common edge, each at least 0.25 m wide perpendicular to the ridge, and that both stay above the assumed ground.

The scene stores both planes with stable IDs, their source trace and the operator's ridge assumptions. Studio calculates PV layout on their sloping areas. Automated references cover east–west and north–south orientation, off-centre ridges, OBJ seam height, invariant geometry after reversing the input points, and invalid inputs. Complex roofs, tracing a facade from a photograph and automatic recovery of pitch and height remain separate work.

## P14 · seed-based contour suggestion

With an orthophoto and a selected building, choose **Obrysuj dach → Zaproponuj obrys** and point inside the visible roof. The suggested ring goes into the existing editable draft. The estimated scene still requires the operator's height and explicit application. The saved trace records `suggestion_method=seed-rgb-v1`, including after vertex corrections.

The browser runs two bounded connected-region passes on the existing raster and compares their size. The search uses the building's EGiB envelope plus 8 m, bounded to 320 × 320 pixels. The extracted exterior ring must be stable and cover 60–160% of the EGiB area within the 250 m² scene limit. This is a heuristic check on a single ring. No-data, unstable, clipped or materially incomplete proposals fall back to manual drawing.

Automated replay uses generated rectangles, a concave roof and a rotated roof, with independent polygon IoU and boundary-distance checks. In a separate exploratory run on six manually outlined roofs from three GUGiK captures, one proposal went through (IoU 0.808, sampled maximum boundary difference 1.23 m at the requested 0.2 m/pixel); five were declined. The exploratory run used the reference polygon envelope and area as proxies for EGiB and took 0.02–5.21 ms per detector call on the local test machine, with image fetch and decode excluded. The outlines are visual annotations and the small convenience sample does not estimate field accuracy. The satellite-only acceptance scenario requires its own data, worker and validation.

## P13 · binary glTF export

Choose **Eksport → Model 3D GLB** to download the current layout. `POST /api/model.glb` uses the existing scene and optional variant input. The mesh includes roof and facade faces, their openings, chimney and skylight geometry, and the selected PV layout. Units are metres. The axes match the renderer and OBJ (X east, Y up, Z −north).

Surface and obstacle nodes keep stable IDs. PV panels are batched by surface with module IDs in draw order. Top-level metadata includes the input hash, engine version and variant. The binary contains its own geometry and flat materials. The project JSON retains editable inputs and source evidence. [glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.pdf)

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

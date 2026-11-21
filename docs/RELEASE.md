# Release history

## P08 · Scene v2 foundation acceptance · 21 November 2026

- [Application commit](https://github.com/maciejbrasewicz/bipv-blueprint/commit/ff9f87fda0d8966d66284ed590a21eb03065d5f6) is live on Railway deployment `ac2779e7-f699-4bbc-a73e-879afd171ac6`. Railway reached SUCCESS and the production health endpoint reported the same commit. The deployment uses one replica with 250 MB RAM, 0.1 vCPU and sleep mode.
- [Quality gates](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44883788038) passed with 46 Python tests, six Chromium flows, PostgreSQL migrations and a Docker smoke test with the deployment limits. [Production verification](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44891454000) passed with one live API isolation test and four Chromium journeys. They covered actual guest save, v1/v2 history, stale revision rejection, 2D editing, 3D rendering and OBJ, and removing the API test project.
- Hosted Supabase migration `20261121094820_allow_scene_v2_documents` matches the repository. A rollback-only fixture confirmed the old v1 snapshot and the v2 evidence-bearing snapshot, stale updates and foreign-organization read/write isolation under the database role. The hosted SQL test uses role simulation. A provisioned pilot account is needed to verify the complete named sign-in flow in production. Cloud smoke and SQL fixtures were checked for cleanup.
- The security advisor reported two informational findings for private organization tables that are deliberately accessed through functions. The performance advisor flagged overlapping guest and named-user policies and an unused organization index. Track them with workload measurements before changing the access policies. [RLS performance finding](https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies)
- Validation fixtures use repository-authored synthetic geometry and catalog data. No imagery, address dataset or manufacturer input is needed for this baseline. The Electrotile acceptance thresholds still require the customer system, appropriately licensed imagery and reference cases. [Fixture manifest](../tests/fixtures/product/manifest.json) · [Acceptance protocol](ELECTROTILE-ACCEPTANCE.md)
- P09 technical input: a live sample confirms GUGiK UUG returns address-point candidates. A candidate does not establish the roof or building footprint. The selected point will feed a distinct building-selection step. Preserve the source CRS during conversion and check usage conditions before retaining third-party data. [UUG contract](https://services.gugik.gov.pl/uug/opis.html) · [Building data service](https://www.geoportal.gov.pl/aktualnosci/zbiorcza-usluga-wfs-dla-ewidencji-gruntow-i-budynkow-udostepniona-w-modulach-mapowych-serwisu-geoportal-gov-pl/)

## Named organization workspaces

- [Application commit](https://github.com/maciejbrasewicz/bipv-blueprint/commit/c71487533be70a86b857fcfd2786ca0b979eabec) reached SUCCESS on the existing Railway service. Deployment `584c666e-ad45-4fbc-b268-2ebd11a0ab8b`. The viewport switches to the metric 2D plan when WebGL cannot initialize. The public account dialog was verified in that mode. [Quality gates](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44838012814) include a simulated WebGL failure and the account-transfer browser flow with a test Auth response.

- [Application commit](https://github.com/maciejbrasewicz/bipv-blueprint/commit/ab373fbde073c21a8013685f68070735f6a67d1e) reached SUCCESS on the existing Railway service. Deployment `4565b132-c2e7-4b7e-bee9-556348296a49`.
- Named accounts open organization workspaces. An explicit guest claim preserves project identity and revisions, and removes guest access. Project and private Storage access use current membership.
- Hosted migrations `20261120230537` and `20261120230542` were applied and verified in a rolled-back fixture transaction. The GitHub migration versions match the hosted history.
- [Quality gates](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44834745731) passed on the promoted SHA. [Production verification](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44838435416) confirmed the deployed SHA, guest data isolation, revision writes and all three live editor journeys. Named login and claim UI use a test Auth response in CI. The live browser check covered the public account form and the 2D fallback; the authorization and migration claims were also tested directly on the hosted database.

## Metric plan and product contracts · 20 November 2026

- [Application commit](https://github.com/maciejbrasewicz/bipv-blueprint/commit/95841ae57a61d43bdc73937dfe877a8ebe7c39d1) reached SUCCESS on the existing Railway service. Deployment ID `7290da93-7c0e-494e-a2d4-766628349164`.
- The editor has a metric UV plan per surface, including concave outlines, holes and active variant placement. Obstacle selection persists between 2D and 3D, with numeric editing and undo.
- [Quality gates](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44826345273) passed on the promoted SHA. The run covers 30 Python tests, three Chromium journeys, the PostgreSQL migration and history checks, the unchanged 20-test roof ZIP, and a Docker run at 250 MB / 0.1 vCPU.
- [Production verification](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44826881385) passed the live SHA, guest isolation and revision storage, and the three Chromium journeys for the pinned SHA in [production-target.json](production-target.json). The organization migration is tracked for P04/P05. The runtime uses the existing guest project API and data.

## Planar geometry and OBJ release · 20 November 2026

- [Deployed commit](https://github.com/maciejbrasewicz/bipv-blueprint/commit/a4b6c2f8cf96a2835bf05504c13425b303747c3b) on Railway. Deployment bd5de298-343f-4121-b90e-cd9d80569e10 reached SUCCESS. The production health check matched the promoted SHA.
- The editor accepts concave roof and facade outlines and interior openings in metric UV. The OBJ export preserves holes and selected module positions. Legacy gable scenes remain readable.
- [Quality gates](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44816156045) passed for the promoted commit: 20 Python tests, both Chromium studio journeys and the Docker smoke at 250 MB / 0.1 vCPU. The Docker smoke sampled 45.39 MiB after the layout call.
- [Roof test archive](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44816156045/artifacts/14670086147) was generated from the promoted commit. CI extracted it and independently reran all 20 tests from its contents.
- [Production verification](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44816619487) passed for live cloud isolation, revision history and browser import/render/OBJ. A separate live API check saved the imported example to Supabase, read it back from revision 1, verified the same layout input hash and removed the test project.
- The release retains the existing plans and limits. The benchmark status and next integrations are in [the Electrotile delivery matrix](ELECTROTILE-DELIVERY.md).

# Project history release · 20 November 2026

- Live application: https://bipv-studio-production.up.railway.app
- Deployed commit: [634078c](https://github.com/maciejbrasewicz/bipv-blueprint/commit/634078cd23f0e50c8b8a65048768d3615bfedd03). Railway deployment 37d556cf-0455-4056-8de6-a4787bc0fc49 reached SUCCESS. The public health endpoint returned the same SHA.
- [Quality gates](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44789712715) passed, including Python and browser checks and the resource-limited Docker smoke.
- [Production verification](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44790703784) passed. The API test checked guest isolation for both current and historical records and rejected stale writes. The Chromium test saved a project, changed it, loaded revision 1, verified that the cloud head was still revision 2, saved the restored scene as revision 3 and removed its fixture.
- Supabase applied migration 20261120163403. The backfill left no project without a snapshot of its head. An isolated rollback-only fixture confirmed the 20-revision limit after 23 saves and cascade cleanup. Security advisors returned no lints.
- Operational limits remain one sleeping Railway service at 250 MB / 0.1 vCPU and Supabase Free. Projects that existed at migration time start their history at the saved head. Production controls and next tasks are documented in [HANDOFF.md](HANDOFF.md).

# R1 release

- Deployed code: [08bff592c6f72f5137a14ae6684a475c583033fa](https://github.com/maciejbrasewicz/bipv-blueprint/commit/08bff592c6f72f5137a14ae6684a475c583033fa).
- Railway deployment: 2e72e9f2-105c-47be-a4db-fa4cfb3d16f3; observed terminal status **SUCCESS**.
- Live studio: https://bipv-studio-production.up.railway.app
- [Exact-commit quality run](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44770026321): **SUCCESS**. 14 backend tests, real Chromium interaction test and Docker smoke at 250 MB / 0.1 CPU passed. Cloud-only case is intentionally skipped in local CI.
- Container after layout: 45.22 MiB RAM under a 238.4 MiB cap. The first live Railway sample was 0.0464 GB RAM; this is an instantaneous sample, not a monthly bill forecast.
- [Production verification](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44772861615): **SUCCESS**. The live health commit matched the promoted code. API guest isolation and stale revisions passed (4.3 s); the live browser flow, UI save and desktop/mobile checks passed (19.3 s). Both test cases removed their own records.
- [Current CI infrastructure verification](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44772861635): **SUCCESS** after separating API checks from browser fixtures and using headless-only browser installation. These follow-up changes affect tests/workflows, not the deployed application.
- The final live Railway sample after cloud tests was **0.0486 GB RAM** with current CPU usage 0. This is an instantaneous sample, not a billing forecast.
- The evidence/r1 branch stores screenshots and observed statuses; evidence/live/run.json is the live check result, not a planned PASS.
- Supabase security and performance advisors returned no lints after migrations.

Railway is pinned to the code SHA above. Later documentation commits do not alter the deployed version. Promotion is explicit and normal CI never writes application code or dependency locks.

R1 is a bounded procedural demonstrator: demo products, synthetic scene, geometric layout and sun-shadow preview. Manufacturer data, address reconstruction/ML, annual energy, electrical sizing and runtime AI are future stages. Guest access uses a private browser capability; losing browser storage loses its workspace key. An interrupted early local fixture can remain outside visible user workspaces.

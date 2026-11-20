# Planar geometry and OBJ release · 20 November 2026

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

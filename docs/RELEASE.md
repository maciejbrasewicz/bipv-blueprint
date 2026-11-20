# R1 release

- Deployed code: [08bff592c6f72f5137a14ae6684a475c583033fa](https://github.com/maciejbrasewicz/bipv-blueprint/commit/08bff592c6f72f5137a14ae6684a475c583033fa).
- Railway deployment: 2e72e9f2-105c-47be-a4db-fa4cfb3d16f3; observed terminal status **SUCCESS**.
- Live studio: https://bipv-studio-production.up.railway.app
- [Exact-commit quality run](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44770026321): **SUCCESS**. 14 backend tests, real Chromium interaction test and Docker smoke at 250 MB / 0.1 CPU passed. Cloud-only case is intentionally skipped in local CI.
- Container after layout: 45.22 MiB RAM under a 238.4 MiB cap. The first live Railway sample was 0.0464 GB RAM; this is an instantaneous sample, not a monthly bill forecast.
- [Production verification](https://github.com/maciejbrasewicz/bipv-blueprint/actions/workflows/production-smoke.yml) is triggered by this release-target update. It verifies the health commit, UI save, two guest-workspace isolation, denied cross-read/update/delete, stale revisions and fixture cleanup on the actual hosted service.
- The evidence/r1 branch stores screenshots and observed statuses; evidence/live/run.json is the live check result, not a planned PASS.
- Supabase security and performance advisors returned no lints after migrations.

Railway is pinned to the code SHA above. Later documentation commits do not alter the deployed version. Promotion is explicit and normal CI never writes application code or dependency locks.

R1 is a bounded procedural demonstrator: demo products, synthetic scene, geometric layout and sun-shadow preview. Manufacturer data, address reconstruction/ML, annual energy, electrical sizing and runtime AI are future stages. Guest access uses a private browser capability; losing browser storage loses its workspace key. An interrupted early local fixture can remain outside visible user workspaces.

# R1 verification and release

The quality pipeline checks frozen dependency locks, committed formatting, independent metric geometry oracles, API contracts, real Chromium interaction tests and the Docker runtime at 250,000,000 bytes RAM / 0.1 CPU. The initial verified candidate had 14 backend tests passing, one Chromium test passing (cloud integration intentionally skipped before deployment), and Docker health/layout passing; measured container memory was 45.2 MiB.

Final releases are pinned to the exact green SHA. The production verification workflow reads docs/production-target.json and requires live /api/health to report that same SHA and cloud_configured=true. It then runs browser interaction, actual UI save, two guest-workspace isolation and stale-revision tests. Tests remove only their own temporary records.

Artifacts and the evidence/r1 branch retain desktop/mobile screenshots plus tested/deployed SHA and run ID. They describe observed execution, not planned checks. Supabase security and performance advisors returned no lints after the two migrations.

R1 remains a bounded procedural demonstrator. Manufacturer catalog, reconstruction/ML, annual energy, electrical sizing and runtime AI are future stages. Guest workspace access is browser-capability based; losing browser storage loses that workspace key. An interrupted early local fixture can remain outside visible user workspaces.

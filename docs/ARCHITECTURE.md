# R1 architecture and budget override

React / Three.js -> same-origin FastAPI -> Supabase Data API. The compiled UI and API share one non-root Docker container, one replica and one Uvicorn process. Shapely resolves geometry and module placements. No runtime LLM/GPU calls.

## Contract and geometry

Scene v1 in server/models.py is the authoritative parametric input. The gable roof resolves into two right-handed orthonormal surface bases in metric ENU. Rendering maps (E,N,U) to (E,U,-N). Layout coordinates are metric surface U/V. The response includes a SHA-256 of canonical input, engine version and warnings. The proposed full free-form Scene contract from the blueprint is a future extension; it is not implemented by this parametric input.

Each orientation searches 16 bounded grid phases. Entire module rectangles must be contained in the setback roof minus expanded obstacle footprints. This deterministic heuristic does not guarantee a global optimum. Tests build the legal region independently, check overlap and compare an unobstructed roof to an analytical module count.

Power is module count times demo Wp. No annual energy or electrical compliance is implied. SunCalc drives a 3D shadow map at Szczecin coordinates, using an explicitly fixed CET offset even in summer. Below-horizon direct light is disabled. This preview supplies no irradiance or shade coefficient to a yield calculation.

## Guest access and storage

The browser generates a 256-bit random workspace capability. Only SHA-256 is stored in Postgres. The raw key stays in browser storage and is transmitted over HTTPS as X-Workspace-Key to the same-origin API and then PostgREST. RLS checks ownership on SELECT/INSERT/UPDATE/DELETE. Column grants prevent supplying/changing owner or timestamps. The server uses a publishable key, never service-role.

This is guest capability access, not named-user authentication. Anyone holding the key can access that workspace; losing browser storage loses access. JSON export is the portable scene backup. HTTPS and XSS protection are essential. Named-user Auth, invitations, retention and identity-based abuse controls precede a production customer launch.

Quotas: 10 projects/workspace, 1000 global, 65 KB/scene. A narrowly privileged private-schema trigger checks quotas under a transaction lock. It has empty search_path and no public execute grant. Revision increments must be exactly one; API PATCH filters the expected prior revision and returns HTTP 409 on stale writes. Browser integration tests use two guest keys and verify denied cross-read/update/delete and revision conflicts, then remove their own fixtures.

## 5 USD deployment

The user's budget replaces the blueprint's previous 45 USD profile. Existing Supabase Free + one Railway Hobby service in Netherlands, **250 MB RAM / 0.1 vCPU**. No volume, Redis, worker service, GPU, MLflow server or paid add-on. No always-on connection, background job polling, telemetry export or heartbeat. Browser rendering runs on demand. Gzip and immutable caching of hashed assets reduce transfer.

At documented rates (10 USD/GB-month RAM, 20 USD/vCPU-month CPU), simultaneous full use of both caps corresponds to about 4.50 USD/month compute. Transfer, taxes and the user's other services are additional; the 5 USD included usage is shared across the workspace. These service limits are not a global bill cap. No account-wide limit was changed because it could stop unrelated apps. Sleep introduces cold starts; Supabase Free can pause after inactivity.

## Delivery and next stages

CI locks dependencies, formats/checks code, runs independent oracles and API contracts, builds the frontend, runs Chromium interaction tests and starts Docker under the production CPU/RAM envelope. Railway promotion is pinned to an exact green SHA. Base images use distribution tags, not immutable digests; digest pinning plus an update policy is future hardening.

Next: named-user Auth and guest migration; immutable scene versions and free-form polygons/holes; actual manufacturer catalog and cut rules; licensed imagery reconstruction with measured reference cases; pvlib weather/irradiance/temperature/DC/AC model; bounded typed assistant tools with actual traces. Satellite-only procurement validation is a separate track from optional LiDAR enrichment. Heavy ML experiments run on an existing local/Foundry machine until another budget is authorized.

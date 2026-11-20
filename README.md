# Registry9 BIPV Studio

**Live:** https://bipv-studio-production.up.railway.app

[Quality gates](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44834745731) · [Production verification](https://github.com/maciejbrasewicz/bipv-blueprint/actions/workflows/production-smoke.yml)

BIPV design software for installers and planners. The current release includes roof and facade geometry, an interactive 3D editor, layout variants, exports and private revision history. See the roadmap for the address-to-offer workflow.

## Start here

[Product roadmap](docs/PRODUCT-ROADMAP.md) · [Product UX](docs/PRODUCT-UX.md) · [Foundry execution](foundry/PRODUCT-EXECUTION.md)

[Engineering handoff](docs/HANDOFF.md) · [Release evidence](docs/RELEASE.md)

[Electrotile requirements and delivery plan](docs/ELECTROTILE-DELIVERY.md) · [Runnable roof tests](docs/ROOF-TEST-PACK.md) · [Download the test archive](https://github.com/maciejbrasewicz/bipv-blueprint/actions/runs/44816156045/artifacts/14670086147)

## Implemented

- Named organization workspaces with private project history and an explicit guest-to-organization transfer.

- Metric 2D plan for each roof or facade surface with openings, module placement and obstacle selection shared with the 3D editor.

- Saved project history with up to 20 revisions. Load any retained revision into the editor and save it as a new revision.
- Concave roof and facade import with holes, and 3D OBJ export with the selected BIPV layout.
- Editable gable roof: width, projected depth, pitch, eaves height, azimuth; one or both surfaces.
- Add/edit/remove chimneys and skylights; undo/redo; perspective, top and front views.
- Two module orientations, sixteen grid phases each, full-polygon containment and obstacle/edge setbacks.
- Actual module count, active area, coverage and STC power from an explicitly fictional demo catalog.
- Astronomical sun direction and shadow preview for Szczecin, fixed CET time.
- Autosaved local scene; capability-private Supabase guest workspace; revision conflicts; JSON round trip and CSV quantities.
- Input SHA-256, algorithm version, warnings, independent tests and desktop/mobile interface.

Not yet implemented: address reconstruction, satellite ingestion/ML, manufacturer rules, annual yield, string/inverter sizing, full BOM/pricing and runtime AI agents. R1 makes no claim to satisfy the procurement's satellite-only reconstruction requirements.

## Run

Requires Node 24, Python 3.12+ and uv.

```sh
uv sync --frozen --dev
npm ci --prefix web
npm run build --prefix web
uv run uvicorn server.app:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000. Without cloud configuration the geometry works locally. For Supabase persistence apply the tracked migrations to the explicitly chosen project and export SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY into the server process. See .env.example. A service-role key is neither needed nor supported. The server does not implicitly load .env.

Frontend development: npm run dev --prefix web, with API on port 8000. OpenAPI: /openapi.json.

```sh
uv run ruff check server
uv run ruff format --check server
uv run pytest -q
npm run format:check --prefix web
npm run build --prefix web
cd web && npx playwright install chromium && npm run test:e2e
```

Live cloud checks use the same browser tests with BASE_URL set to the deployed origin and LIVE_CLOUD=1. They create independent temporary guest workspaces and remove only their own projects.

## Cost and deployment

Dockerfile serves the frontend and FastAPI together. Railway has one replica, sleep enabled, **250 MB RAM / 0.1 vCPU limits**, no volume, no Redis, no GPU and no paid add-ons. Supabase uses the existing Free project. Active roof area is bounded to 250 m², obstacles to 12, guest projects to 10/workspace and 1000 globally, each scene to 65 KB.

The 5 USD Hobby subscription includes usage shared with all other apps in the workspace. Service limits and sleep reduce usage; they are not an account billing cap and do not guarantee a 5 USD invoice. No recurring polling, socket subscription, model downloads or idle DB pings run in the service.

Promote an exact green commit. Routine pushes do not automatically promote a new version. CI checks the frozen dependency locks, API and independent geometry tests, Chromium interaction tests and Docker at the same CPU/RAM limits. The evidence/r1 branch holds browser review screenshots and the actual tested SHA.

See [architecture](docs/ARCHITECTURE.md), [release evidence](docs/RELEASE.md) and [Foundry handoff](foundry/START_HERE.md).

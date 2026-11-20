# BIPV Studio implementation rules

Start with docs/PRODUCT-ROADMAP.md and foundry/PRODUCT-EXECUTION.md. For existing contracts read docs/HANDOFF.md and docs/ARCHITECTURE.md. Check docs/RELEASE.md for the verified deployed scope.

- Python domain/API: server/. Frontend: web/. DDL: tracked supabase/migrations/. API input contract: Scene in server/models.py.
- Metric ENU is authoritative; render mapping (E,N,U) -> (E,U,-N). Check full module polygons, holes, edge setback and obstacle clearance. Preserve independent geometric oracles.
- Label synthetic scenes and fixture catalog values. Never invent manufacturer data, energy accuracy, model metrics, agent execution or PASS evidence.
- Budget: one sleeping Railway Hobby service, one replica, 250 MB RAM and 0.1 vCPU, Supabase Free. No GPU, Redis, volume, paid add-on, idle polling or keep-alive.
- Never use a Supabase service-role key or commit .env. Preserve capability-scoped RLS, column grants and optimistic revision checks. Named users use same-origin HttpOnly cookie sessions, current membership checks and explicit organization scope.
- Gates: uv run ruff check server; uv run ruff format --check server; uv run pytest -q; npm run format:check --prefix web; npm run build --prefix web; Chromium E2E; Docker smoke at production limits.
- Changes to cloud storage require the live two-workspace isolation and stale-revision tests. Do not run fixture tests against unrelated projects or retain test scenes.
- Promote an exact CI-green commit to Railway. A queued build is not a successful deployment. Verify terminal SUCCESS and the live health commit before reporting release.
- Foundry role/task files describe the development workflow. Their presence is not evidence those agents ran. Runtime AI is separate and may use only bounded typed tools.

# R1 release evidence

GitHub Actions and Railway are the authoritative execution records. A release is not successful until CI is green, Railway reaches SUCCESS and the live /api/health commit matches the promoted SHA.

The evidence/r1 branch records the actual tested commit, run ID and status beside Chromium desktop/mobile screenshots. Cloud-isolation tests run separately against the deployed service and remove only their own temporary records. A fixture from an interrupted early local test may remain; it is not an application seed or a real client project.

Source, migrations and deployment settings are persisted in GitHub. The initial local workspace became unavailable during development, so completion and browser/container verification proceed on GitHub-hosted runners.

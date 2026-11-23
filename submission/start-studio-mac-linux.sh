#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
if ! command -v uv >/dev/null 2>&1; then
  echo "Zainstaluj uv: https://docs.astral.sh/uv/getting-started/installation/" >&2
  exit 1
fi
uv sync --python 3.12 --frozen --dev
uv run --python 3.12 --frozen python scripts/run_local_studio.py

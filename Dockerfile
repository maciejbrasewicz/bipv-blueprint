FROM node:24-bookworm-slim AS web
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY web/ ./
RUN npm run build

FROM python:3.12-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 OMP_NUM_THREADS=1 OPENBLAS_NUM_THREADS=1 WEB_DIST=/app/web/dist
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt && useradd --create-home --uid 10001 studio
COPY --from=web /build/web/dist ./web/dist
COPY server ./server
COPY scripts/check_electrotile_run.py scripts/electrotile_checks.py scripts/electrotile_footprint_export.py scripts/electrotile_geometry.py scripts/electrotile_product.py scripts/electrotile_studio_adapter.py ./scripts/
COPY tests/fixtures/electrotile-lab/footprint-export/input.json tests/fixtures/electrotile-lab/footprint-export/reference.json ./tests/fixtures/electrotile-lab/footprint-export/
COPY tests/fixtures/electrotile-lab/studio-pv ./tests/fixtures/electrotile-lab/studio-pv
COPY tests/fixtures/electrotile-lab/studio-geometry ./tests/fixtures/electrotile-lab/studio-geometry
USER studio
EXPOSE 8080
CMD ["python", "-c", "import os,uvicorn; uvicorn.run('server.app:app',host='0.0.0.0',port=int(os.environ.get('PORT','8080')),workers=1,access_log=False)"]

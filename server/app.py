import asyncio
import os
import re
import time
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID, uuid4

import httpx
from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from starlette.middleware.gzip import GZipMiddleware

from .geometry import CATALOG, ENGINE_VERSION, compute
from .models import SaveProject, Scene

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
CLOUD = bool(SUPABASE_URL and SUPABASE_KEY)
DIST = Path(os.getenv("WEB_DIST", "web/dist"))
compute_slots = asyncio.Semaphore(2)
request_window: list[float] = []


@asynccontextmanager
async def lifespan(app: FastAPI):
    async with httpx.AsyncClient(timeout=15, limits=httpx.Limits(max_connections=4)) as client:
        app.state.http = client
        yield


app = FastAPI(
    title="Registry9 BIPV Studio", version="0.1.0", lifespan=lifespan, docs_url=None, redoc_url=None
)
app.add_middleware(GZipMiddleware, minimum_size=1000, compresslevel=5)


@app.middleware("http")
async def bounded_requests(request: Request, call_next):
    if request.url.path.startswith("/api/") and request.method in ("POST", "PATCH"):
        now = time.monotonic()
        request_window[:] = [t for t in request_window if t > now - 60]
        if len(request_window) >= 120:
            return JSONResponse({"detail": "Limit demonstratora: spróbuj ponownie za minutę."}, 429)
        request_window.append(now)
        try:
            length = int(request.headers.get("content-length", "0"))
        except ValueError:
            return JSONResponse({"detail": "Invalid Content-Length"}, 400)
        if length > 70000:
            return JSONResponse({"detail": "Project body is too large"}, 413)
        total, chunks = 0, []
        async for chunk in request.stream():
            total += len(chunk)
            if total > 70000:
                return JSONResponse({"detail": "Project body is too large"}, 413)
            chunks.append(chunk)
        request._body = b"".join(chunks)
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Referrer-Policy"] = "same-origin"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; "
        "worker-src 'self' blob:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'"
    )
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    elif request.url.path.startswith("/assets/"):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "version": "0.1.0",
        "engine": ENGINE_VERSION,
        "cloud_configured": CLOUD,
        "commit": os.getenv("RAILWAY_GIT_COMMIT_SHA", "local"),
    }


@app.get("/api/catalog")
def catalog():
    return {"revision": "demo/1", "is_manufacturer_data": False, "products": CATALOG}


@app.post("/api/layout")
async def layout(scene: Scene):
    async with compute_slots:
        return await run_in_threadpool(compute, scene)


def workspace_headers(key: str | None):
    if not CLOUD:
        raise HTTPException(503, "Zapis w chmurze nie jest skonfigurowany. Zachowano kopię lokalną.")
    if not key or not re.fullmatch(r"[a-f0-9]{64}", key):
        raise HTTPException(401, "Brak poprawnego klucza przestrzeni gościnnej.")
    return {
        "apikey": SUPABASE_KEY,
        "x-workspace-key": key,
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }


async def db(request: Request, method: str, path: str, key: str | None, **kwargs):
    headers = workspace_headers(key)
    try:
        response = await request.app.state.http.request(
            method, f"{SUPABASE_URL}/rest/v1/{path}", headers=headers, **kwargs
        )
    except httpx.HTTPError as exc:
        raise HTTPException(503, "Supabase chwilowo niedostępny. Kopia lokalna jest zachowana.") from exc
    if response.status_code >= 400:
        detail = (
            response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
        )
        if detail.get("code") == "23514":
            raise HTTPException(409, "Przekroczono limit przestrzeni lub kontrakt rewizji projektu.")
        status = 409 if response.status_code == 409 else 503
        raise HTTPException(status, "Nie zapisano w Supabase. Sprawdź połączenie lub limit przestrzeni.")
    return response.json() if response.content else []


PROJECT_FIELDS = "id,name,scene,revision,created_at,updated_at"


@app.get("/api/projects")
async def projects(request: Request, x_workspace_key: str | None = Header(default=None)):
    rows = await db(
        request,
        "GET",
        "bipv_projects",
        x_workspace_key,
        params={"select": "id,name,revision,updated_at", "order": "updated_at.desc", "limit": "10"},
    )
    return {"projects": rows}


@app.get("/api/projects/{project_id}")
async def get_project(project_id: UUID, request: Request, x_workspace_key: str | None = Header(default=None)):
    rows = await db(
        request,
        "GET",
        "bipv_projects",
        x_workspace_key,
        params={"select": PROJECT_FIELDS, "id": f"eq.{project_id}"},
    )
    if not rows:
        raise HTTPException(404, "Projekt nie istnieje w tej przestrzeni.")
    return rows[0]


@app.post("/api/projects", status_code=201)
async def create_project(
    body: SaveProject, request: Request, x_workspace_key: str | None = Header(default=None)
):
    if body.expected_revision is not None:
        raise HTTPException(422, "Nowy projekt nie ma poprzedniej rewizji.")
    rows = await db(
        request,
        "POST",
        "bipv_projects",
        x_workspace_key,
        params={"select": PROJECT_FIELDS},
        json={"id": str(uuid4()), "name": body.scene.name, "scene": body.scene.model_dump()},
    )
    return rows[0]


@app.patch("/api/projects/{project_id}")
async def update_project(
    project_id: UUID,
    body: SaveProject,
    request: Request,
    x_workspace_key: str | None = Header(default=None),
):
    if body.expected_revision is None:
        raise HTTPException(428, "Wymagana poprzednia rewizja projektu.")
    rows = await db(
        request,
        "PATCH",
        "bipv_projects",
        x_workspace_key,
        params={
            "select": PROJECT_FIELDS,
            "id": f"eq.{project_id}",
            "revision": f"eq.{body.expected_revision}",
        },
        json={
            "name": body.scene.name,
            "scene": body.scene.model_dump(),
            "revision": body.expected_revision + 1,
        },
    )
    if not rows:
        raise HTTPException(409, "Projekt zmienił się w innej karcie. Otwórz aktualną wersję.")
    return rows[0]


@app.delete("/api/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: UUID, request: Request, x_workspace_key: str | None = Header(default=None)
):
    await db(
        request, "DELETE", "bipv_projects", x_workspace_key, params={"id": f"eq.{project_id}", "select": "id"}
    )


@app.get("/api/projects/{project_id}/revisions")
async def list_revisions(
    project_id: UUID, request: Request, x_workspace_key: str | None = Header(default=None)
):
    rows = await db(
        request,
        "GET",
        "bipv_project_revisions",
        x_workspace_key,
        params={
            "select": "revision,name,saved_at",
            "project_id": f"eq.{project_id}",
            "order": "revision.desc",
            "limit": "20",
        },
    )
    return {"revisions": rows}


@app.get("/api/projects/{project_id}/revisions/{revision}")
async def read_revision(
    project_id: UUID, revision: int, request: Request, x_workspace_key: str | None = Header(default=None)
):
    rows = await db(
        request,
        "GET",
        "bipv_project_revisions",
        x_workspace_key,
        params={
            "select": "project_id,revision,name,scene,saved_at",
            "project_id": f"eq.{project_id}",
            "revision": f"eq.{revision}",
        },
    )
    if not rows:
        raise HTTPException(404, "Rewizja nie istnieje w tej przestrzeni.")
    return rows[0]


if (DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def studio(path: str):
    if path.startswith("api/") or path.startswith("assets/"):
        raise HTTPException(404)
    if (DIST / "index.html").is_file():
        return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache"})
    return JSONResponse({"detail": "Build the studio with npm run build in web/."}, status_code=503)

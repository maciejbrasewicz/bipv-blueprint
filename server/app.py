import asyncio
import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import UUID, uuid4

import httpx
from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse, PlainTextResponse
from fastapi.staticfiles import StaticFiles
from starlette.concurrency import run_in_threadpool
from starlette.middleware.gzip import GZipMiddleware

from . import demo_lab
from .cloud import CLOUD, db, project_access
from .geo import router as geo_router
from .geo_trace import FootprintSceneInput, TraceSceneInput, scene_from_footprint, scene_from_orthophoto
from .geometry import CATALOG, ENGINE_VERSION, compute
from .glb_export import export_glb
from .model_export import export_obj
from .models import Scene
from .product_contracts import ModelExport, SaveProject, SceneV2

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
app.include_router(geo_router)


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


@app.get("/api/demo/tests")
def demo_tests():
    return demo_lab.catalog()


@app.post("/api/demo/tests/{test_id}")
async def run_demo_test(test_id: str, request: Request):
    if test_id not in demo_lab.TESTS:
        raise HTTPException(404, "Nieznany scenariusz testowy.")
    started = time.perf_counter()
    baseline = None
    if test_id == "address":
        checks = await demo_lab.check_address(request)
    else:
        async with compute_slots:
            if test_id == "footprint-export":
                baseline, checks = await run_in_threadpool(demo_lab.retest_footprint_export)
            elif test_id == "product":
                checks = await run_in_threadpool(demo_lab.replay_product)
            else:
                checks = await run_in_threadpool(demo_lab.check_studio, test_id)
    return {
        "id": test_id,
        "source": demo_lab.TESTS[test_id][2],
        "version": os.getenv("RAILWAY_GIT_COMMIT_SHA", "local"),
        "elapsed_ms": round((time.perf_counter() - started) * 1000),
        "passed": all(row["passed"] for row in checks),
        "checks": checks,
        **({"baseline": baseline} if baseline is not None else {}),
    }


@app.post("/api/layout")
async def layout(scene: Scene):
    async with compute_slots:
        return await run_in_threadpool(compute, scene)


@app.post("/api/scene/validate", response_model=Scene, response_model_exclude_none=True)
def validate_scene(scene: Scene):
    return scene


@app.post("/api/scene/v2/validate", response_model=SceneV2, response_model_exclude_none=True)
def validate_scene_v2(scene: SceneV2):
    return scene


@app.post("/api/scene/from-orthophoto", response_model=SceneV2, response_model_exclude_none=True)
def trace_scene(body: TraceSceneInput):
    try:
        return scene_from_orthophoto(body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/scene/from-footprint", response_model=SceneV2, response_model_exclude_none=True)
def build_footprint_scene(body: FootprintSceneInput):
    try:
        return scene_from_footprint(body)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/model.obj", response_class=PlainTextResponse)
async def model_obj(body: ModelExport):
    async with compute_slots:
        content = await run_in_threadpool(export_obj, body)
    return PlainTextResponse(
        content, headers={"Content-Disposition": 'attachment; filename="bipv-model.obj"'}
    )


@app.post("/api/model.glb", response_class=Response, responses={200: {"content": {"model/gltf-binary": {}}}})
async def model_glb(body: ModelExport):
    async with compute_slots:
        content = await run_in_threadpool(export_glb, body)
    return Response(
        content,
        media_type="model/gltf-binary",
        headers={"Content-Disposition": 'attachment; filename="bipv-model.glb"'},
    )


PROJECT_FIELDS = "id,name,scene,revision,created_at,updated_at"


@app.get("/api/projects")
async def projects(request: Request):
    access = project_access(request)
    rows = await db(
        request,
        "GET",
        "bipv_projects",
        access.headers,
        params={
            "select": "id,name,revision,updated_at",
            "order": "updated_at.desc",
            "limit": "50" if access.organization else "10",
            **access.scope,
        },
    )
    return {"projects": rows}


@app.get("/api/projects/{project_id}")
async def get_project(project_id: UUID, request: Request):
    access = project_access(request)
    rows = await db(
        request,
        "GET",
        "bipv_projects",
        access.headers,
        params={"select": PROJECT_FIELDS, "id": f"eq.{project_id}", **access.scope},
    )
    if not rows:
        raise HTTPException(404, "Projekt nie istnieje w tej przestrzeni.")
    return rows[0]


@app.post("/api/projects", status_code=201)
async def create_project(
    body: SaveProject,
    request: Request,
):
    access = project_access(request)
    if body.expected_revision is not None:
        raise HTTPException(422, "Nowy projekt nie ma poprzedniej rewizji.")
    if access.organization:
        project_id = await db(
            request,
            "POST",
            "rpc/bipv_create_organization_project",
            access.headers,
            json={
                "p_organization": str(access.organization),
                "p_project": str(uuid4()),
                "p_name": body.name,
                "p_scene": body.scene.model_dump(mode="json"),
            },
        )
        return await get_project(project_id, request)
    rows = await db(
        request,
        "POST",
        "bipv_projects",
        access.headers,
        params={"select": PROJECT_FIELDS},
        json={"id": str(uuid4()), "name": body.name, "scene": body.scene.model_dump(mode="json")},
    )
    return rows[0]


@app.patch("/api/projects/{project_id}")
async def update_project(
    project_id: UUID,
    body: SaveProject,
    request: Request,
):
    access = project_access(request)
    if body.expected_revision is None:
        raise HTTPException(428, "Wymagana poprzednia rewizja projektu.")
    rows = await db(
        request,
        "PATCH",
        "bipv_projects",
        access.headers,
        params={
            "select": PROJECT_FIELDS,
            "id": f"eq.{project_id}",
            "revision": f"eq.{body.expected_revision}",
            **access.scope,
        },
        json={
            "name": body.name,
            "scene": body.scene.model_dump(mode="json"),
            "revision": body.expected_revision + 1,
        },
    )
    if not rows:
        raise HTTPException(409, "Projekt zmienił się w innej karcie. Otwórz aktualną wersję.")
    return rows[0]


@app.delete("/api/projects/{project_id}", status_code=204)
async def delete_project(
    project_id: UUID,
    request: Request,
):
    access = project_access(request)
    rows = await db(
        request,
        "DELETE",
        "bipv_projects",
        access.headers,
        params={"id": f"eq.{project_id}", "select": "id", **access.scope},
    )
    if access.organization and not rows:
        raise HTTPException(403, "Tylko właściciel może usunąć projekt organizacji.")


@app.get("/api/projects/{project_id}/revisions")
async def list_revisions(
    project_id: UUID,
    request: Request,
):
    access = project_access(request)
    if access.organization:
        await get_project(project_id, request)
    rows = await db(
        request,
        "GET",
        "bipv_project_revisions",
        access.headers,
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
    project_id: UUID,
    revision: int,
    request: Request,
):
    access = project_access(request)
    if access.organization:
        await get_project(project_id, request)
    rows = await db(
        request,
        "GET",
        "bipv_project_revisions",
        access.headers,
        params={
            "select": "project_id,revision,name,scene,saved_at",
            "project_id": f"eq.{project_id}",
            "revision": f"eq.{revision}",
        },
    )
    if not rows:
        raise HTTPException(404, "Rewizja nie istnieje w tej przestrzeni.")
    return rows[0]


if CLOUD:
    from .accounts import router as account_router

    app.include_router(account_router)


if (DIST / "assets").is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def studio(path: str):
    if path.startswith("api/") or path.startswith("assets/"):
        raise HTTPException(404)
    if (DIST / "index.html").is_file():
        return FileResponse(DIST / "index.html", headers={"Cache-Control": "no-cache"})
    return JSONResponse({"detail": "Build the studio with npm run build in web/."}, status_code=503)

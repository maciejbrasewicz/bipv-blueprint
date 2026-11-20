"""Same-origin boundary for Supabase requests."""

import os
import re
from dataclasses import dataclass
from uuid import UUID

import httpx
from fastapi import HTTPException, Request

SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_PUBLISHABLE_KEY", "")
CLOUD = bool(SUPABASE_URL and SUPABASE_KEY)
RAILWAY_DOMAIN = os.getenv("RAILWAY_PUBLIC_DOMAIN", "")
COOKIE_NAME = "__Host-bipv_session" if RAILWAY_DOMAIN else "bipv_session"


def same_origin(request: Request) -> None:
    origin = f"https://{RAILWAY_DOMAIN}" if RAILWAY_DOMAIN else str(request.base_url).rstrip("/")
    if request.headers.get("origin") != origin:
        raise HTTPException(403, "Żądanie musi pochodzić z BIPV Studio.")


def gateway_headers() -> dict[str, str]:
    if not CLOUD:
        raise HTTPException(503, "Zapis w chmurze nie jest skonfigurowany. Zachowano kopię lokalną.")
    return {"apikey": SUPABASE_KEY, "Prefer": "return=representation"}


def session_token(request: Request) -> str:
    token = request.cookies.get(COOKIE_NAME, "")
    if not re.fullmatch(r"[\w-]+\.[\w-]+\.[\w-]+", token, flags=re.ASCII) or len(token) > 4096:
        raise HTTPException(401, "Zaloguj się ponownie.")
    return token


def authenticated_headers(request: Request) -> dict[str, str]:
    return {**gateway_headers(), "Authorization": f"Bearer {session_token(request)}"}


def guest_key(request: Request) -> str:
    key = request.headers.get("x-workspace-key", "")
    if not re.fullmatch(r"[a-f0-9]{64}", key):
        raise HTTPException(401, "Brak poprawnego klucza przestrzeni gościnnej.")
    return key


@dataclass(frozen=True)
class ProjectAccess:
    headers: dict[str, str]
    organization: UUID | None

    @property
    def scope(self) -> dict[str, str]:
        return {"organization_id": f"eq.{self.organization}"} if self.organization else {}


def project_access(request: Request) -> ProjectAccess:
    headers = gateway_headers()
    organization = request.headers.get("x-organization-id")
    if organization is None:
        return ProjectAccess({**headers, "x-workspace-key": guest_key(request)}, None)
    try:
        organization_id = UUID(organization)
    except ValueError as exc:
        raise HTTPException(422, "Nieprawidłowa organizacja.") from exc
    if request.method not in {"GET", "HEAD"}:
        same_origin(request)
    return ProjectAccess(authenticated_headers(request), organization_id)


async def upstream(request: Request, method: str, path: str, headers: dict[str, str], **kwargs):
    try:
        return await request.app.state.http.request(
            method, f"{SUPABASE_URL}/{path}", headers=headers, **kwargs
        )
    except httpx.HTTPError as exc:
        raise HTTPException(503, "Supabase chwilowo niedostępny.") from exc


async def db(request: Request, method: str, path: str, headers: dict[str, str], **kwargs):
    response = await upstream(request, method, f"rest/v1/{path}", headers, **kwargs)
    if response.status_code >= 400:
        try:
            code = response.json().get("code")
        except (ValueError, AttributeError):
            code = None
        if code == "23514":
            raise HTTPException(409, "Przekroczono limit przestrzeni lub kontrakt rewizji projektu.")
        if response.status_code == 401:
            raise HTTPException(401, "Sesja wygasła lub dostęp jest nieprawidłowy.")
        if response.status_code == 403:
            raise HTTPException(403, "Brak uprawnień do tej operacji.")
        if code == "PT404":
            raise HTTPException(404, "Projekt gościa nie istnieje w tej przestrzeni.")
        if code == "PT409":
            raise HTTPException(409, "Projekt gościa ma nowszą rewizję. Otwórz aktualny zapis.")
        status = 409 if response.status_code == 409 else 503
        raise HTTPException(status, "Nie wykonano operacji w Supabase.")
    return response.json() if response.content else []

"""First-party password sessions and organization commands."""

from uuid import UUID

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import Field, SecretStr

from .cloud import (
    COOKIE_NAME,
    RAILWAY_DOMAIN,
    authenticated_headers,
    db,
    gateway_headers,
    guest_key,
    same_origin,
    upstream,
)
from .models import StrictModel

router = APIRouter(prefix="/api/account")


class SignIn(StrictModel):
    email: str = Field(min_length=3, max_length=254)
    password: SecretStr


class OrganizationInput(StrictModel):
    name: str = Field(min_length=1, max_length=100)


class ClaimInput(StrictModel):
    project_id: UUID
    organization_id: UUID
    expected_revision: int = Field(ge=1, le=1_000_000)


@router.post("/sign-in", status_code=204)
async def sign_in(body: SignIn, request: Request, response: Response):
    same_origin(request)
    password = body.password.get_secret_value()
    if not 1 <= len(password) <= 1024:
        raise HTTPException(422, "Nieprawidłowe hasło.")
    auth = await upstream(
        request,
        "POST",
        "auth/v1/token",
        gateway_headers(),
        params={"grant_type": "password"},
        json={"email": body.email.strip(), "password": password},
    )
    if auth.status_code == 429:
        raise HTTPException(429, "Za dużo prób logowania. Spróbuj później.")
    if 400 <= auth.status_code < 500:
        raise HTTPException(401, "Nieprawidłowy adres e-mail lub hasło.")
    if not auth.is_success:
        raise HTTPException(503, "Logowanie jest chwilowo niedostępne.")
    session = auth.json()
    if session.get("user", {}).get("is_anonymous"):
        raise HTTPException(403, "Wymagane konto imienne.")
    response.set_cookie(
        COOKIE_NAME,
        session["access_token"],
        max_age=min(3600, int(session["expires_in"])),
        httponly=True,
        secure=bool(RAILWAY_DOMAIN) or request.url.scheme == "https",
        samesite="strict",
    )


@router.post("/sign-out", status_code=204)
async def sign_out(request: Request, response: Response):
    same_origin(request)
    response.delete_cookie(
        COOKIE_NAME,
        httponly=True,
        secure=bool(RAILWAY_DOMAIN) or request.url.scheme == "https",
        samesite="strict",
    )


@router.get("/organizations")
async def organizations(request: Request):
    return {
        "organizations": await db(request, "GET", "rpc/bipv_my_organizations", authenticated_headers(request))
    }


@router.post("/organizations", status_code=201)
async def create_organization(body: OrganizationInput, request: Request):
    same_origin(request)
    if not body.name.strip():
        raise HTTPException(422, "Podaj nazwę organizacji.")
    organization_id = await db(
        request,
        "POST",
        "rpc/bipv_create_organization",
        authenticated_headers(request),
        json={"p_name": body.name.strip()},
    )
    return {"id": organization_id, "name": body.name.strip(), "role": "owner"}


@router.post("/claim")
async def claim(body: ClaimInput, request: Request):
    same_origin(request)
    project_id = await db(
        request,
        "POST",
        "rpc/bipv_claim_project",
        {**authenticated_headers(request), "x-workspace-key": guest_key(request)},
        json={
            "p_project": str(body.project_id),
            "p_organization": str(body.organization_id),
            "p_revision": body.expected_revision,
        },
    )
    return {"id": project_id}

"""Bounded clients for GUGiK address points and candidate building footprints."""

import asyncio
import json
import os
from collections import deque
from datetime import UTC, datetime
from time import monotonic
from xml.etree import ElementTree

import httpx
from fastapi import APIRouter, HTTPException, Request
from pyproj import Transformer
from pyproj.exceptions import ProjError
from shapely import Point, Polygon
from shapely.errors import GEOSException
from shapely.ops import unary_union

from .geo_contracts import AddressPoint, AddressText, SceneSite
from .models import StrictModel

router = APIRouter(prefix="/api/geo")
CRS = "urn:ogc:def:crs:EPSG::2180"
TO_WGS84 = Transformer.from_crs(2180, 4326, always_xy=True)
ADDRESS_SOURCE = {
    "id": "gugik-uug",
    "name": "GUGiK · Uniwersalna Usługa Geokodowania",
    "url": "https://services.gugik.gov.pl/uug/",
    "rights_url": "https://services.gugik.gov.pl/uug/opis.html",
    "retention": "selected_reference",
}
BUILDING_SOURCE = {
    "id": "gugik-egib-wfs",
    "name": "GUGiK · zbiorcza usługa WFS EGiB",
    "url": "https://mapy.geoportal.gov.pl/wss/service/PZGIK/EGIB/WFS/UslugaZbiorcza",
    "rights_url": "https://www.dziennikustaw.gov.pl/D2026000138901.pdf",
    "retention": "selected_reference",
}
NS = {
    "wfs": "http://www.opengis.net/wfs/2.0",
    "gml": "http://www.opengis.net/gml/3.2",
    "ms": "http://mapserver.gis.umn.edu/mapserver",
}
MAX_FEATURES = 32
MAX_BYTES = 512 * 1024
RADIUS_M = 60
geo_requests: deque[float] = deque()
geo_slots = asyncio.Semaphore(2)


class AddressSearch(StrictModel):
    address: AddressText


def geography_enabled():
    return os.getenv("BIPV_GEODATA_ENABLED", "1") == "1"


@router.get("/sources")
def sources():
    return {"enabled": geography_enabled(), "crs": "EPSG:2180", "sources": [ADDRESS_SOURCE, BUILDING_SOURCE]}


async def read_source(request: Request, source: dict, params: dict) -> bytes:
    if not geography_enabled():
        raise HTTPException(503, "Wyszukiwanie w publicznych rejestrach jest wyłączone.")
    now = monotonic()
    while geo_requests and geo_requests[0] <= now - 60:
        geo_requests.popleft()
    if len(geo_requests) >= 30 or geo_slots.locked():
        raise HTTPException(429, "Limit wyszukiwania. Spróbuj ponownie za chwilę.")
    geo_requests.append(now)
    try:
        async with geo_slots, asyncio.timeout(14):
            async with request.app.state.http.stream(
                "GET", source["url"], params=params, headers={"Accept-Encoding": "identity"}
            ) as response:
                if response.status_code == 429:
                    raise HTTPException(429, "GUGiK ograniczył liczbę zapytań. Spróbuj ponownie za chwilę.")
                if response.status_code in (401, 403, 451):
                    raise HTTPException(502, "Rejestr GUGiK nie udostępnił danych dla tego zapytania.")
                response.raise_for_status()
                body = bytearray()
                async for chunk in response.aiter_bytes():
                    if len(body) + len(chunk) > MAX_BYTES:
                        raise HTTPException(502, "Odpowiedź rejestru jest za duża.")
                    body.extend(chunk)
                return bytes(body)
    except (TimeoutError, httpx.TimeoutException) as exc:
        raise HTTPException(504, "GUGiK nie odpowiedział w wyznaczonym czasie.") from exc
    except httpx.HTTPError as exc:
        raise HTTPException(502, "Usługa GUGiK jest chwilowo niedostępna.") from exc


def parse_address_points(body: bytes) -> list[AddressPoint]:
    data = json.loads(body)
    returned = data["returned objects"]
    if type(returned) is not int or returned < 0 or data["type"] != "address":
        raise ValueError("Unexpected address response")
    if not returned:
        return []
    rows = data["results"]
    if len(rows) != returned:
        raise ValueError("Unexpected address count")
    points = []
    for row in list(rows.values())[:15]:
        if not row.get("number"):
            continue
        locality = ", ".join(dict.fromkeys(filter(None, [row["city"], row.get("citypart")])))
        road = " ".join(filter(None, [row.get("street"), row["number"]]))
        region = (row.get("jednostka") or "").strip("{}").split(",")
        region_label = ", ".join(filter(None, region[1:3]))
        points.append(
            AddressPoint(
                label=f"{locality}, {road}",
                region=" · ".join(filter(None, [row.get("code"), region_label])),
                easting_m=row["x"],
                northing_m=row["y"],
            )
        )
    return points


def read_ring(element):
    positions = element.findtext("gml:LinearRing/gml:posList", namespaces=NS)
    if positions is None:
        raise ValueError("Missing ring coordinates")
    ordinates = positions.split()
    if len(ordinates) < 8 or len(ordinates) > 1024 or len(ordinates) % 2:
        raise ValueError("Invalid ring dimensions")
    pairs = [
        (float(easting), float(northing))
        for northing, easting in zip(ordinates[::2], ordinates[1::2], strict=True)
    ]
    if pairs[0] != pairs[-1] or any(not (0 <= value <= 1_000_000) for pair in pairs for value in pair):
        raise ValueError("Invalid EPSG:2180 ring")
    return pairs


def parse_buildings(body: bytes, point: AddressPoint, retrieved_at: datetime):
    # Decode before parsing so declarations cannot hide behind a different XML encoding.
    xml = body.decode("utf-8-sig")
    if "<!DOCTYPE" in xml or "<!ENTITY" in xml:
        raise ValueError("Unexpected XML declaration")
    root = ElementTree.fromstring(xml)
    if root.tag != "{http://www.opengis.net/wfs/2.0}FeatureCollection":
        raise ValueError("Unexpected WFS document")
    members = root.findall("wfs:member", NS)
    if len(members) > MAX_FEATURES or int(root.attrib["numberReturned"]) != len(members):
        raise ValueError("Unexpected feature count")
    truncated = "next" in root.attrib or len(members) == MAX_FEATURES
    origin = Point(point.easting_m, point.northing_m)
    candidates = []
    seen = set()
    unavailable = 0
    for member in members:
        building_id = member.findtext("ms:budynki/ms:ID_BUDYNKU", namespaces=NS)
        if building_id in seen:
            continue
        geometry = member.find("ms:budynki/ms:geom", NS)
        try:
            parts = []
            if geometry is not None:
                for polygon in geometry.findall(".//gml:Polygon", NS):
                    declared_crs = polygon.get("srsName") or next(iter(geometry)).get("srsName")
                    if declared_crs != CRS:
                        raise ValueError("Unexpected building CRS")
                    shell = read_ring(polygon.find("gml:exterior", NS))
                    holes = [read_ring(ring) for ring in polygon.findall("gml:interior", NS)]
                    part = Polygon(shell, holes)
                    if not part.is_valid or part.is_empty:
                        raise ValueError("Invalid building footprint")
                    parts.append(part)
            if not parts:
                raise ValueError("Missing building footprint")
            footprint = unary_union(parts)
            distance = footprint.distance(origin)
            if distance > RADIUS_M:
                continue
            anchor = footprint.representative_point()
            lon, lat = TO_WGS84.transform(anchor.x, anchor.y, errcheck=True)
            site = SceneSite(
                address=point.label,
                building_id=building_id,
                latitude_deg=round(lat, 7),
                longitude_deg=round(lon, 7),
                source="gugik-egib-wfs",
                retrieved_at=retrieved_at,
            )
        except (AttributeError, GEOSException, ProjError, ValueError):
            unavailable += 1
            continue
        rings = [
            [
                [[round(x - origin.x, 2), round(y - origin.y, 2)] for x, y in ring.coords]
                for ring in (part.exterior, *part.interiors)
            ]
            for part in parts
        ]
        seen.add(building_id)
        candidates.append((distance, site, rings, footprint.area))
    if unavailable and not candidates:
        raise ValueError("No usable footprints in provider response")
    candidates.sort(key=lambda item: (item[0], item[1].building_id))
    return {
        "radius_m": RADIUS_M,
        "partial": bool(truncated or unavailable),
        "candidates": [
            {"site": site, "distance_m": round(distance, 1), "rings_m": rings, "area_m2": round(area, 1)}
            for distance, site, rings, area in candidates
        ],
    }


@router.post("/addresses")
async def addresses(query: AddressSearch, request: Request):
    body = await read_source(request, ADDRESS_SOURCE, {"request": "GetAddress", "address": query.address})
    try:
        return {"candidates": parse_address_points(body)}
    except (AttributeError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(502, "Nie udało się odczytać wyników wyszukiwania adresu.") from exc


@router.post("/buildings")
async def buildings(point: AddressPoint, request: Request):
    north, east = point.northing_m, point.easting_m
    bbox = f"{north - RADIUS_M},{east - RADIUS_M},{north + RADIUS_M},{east + RADIUS_M},{CRS}"
    body = await read_source(
        request,
        BUILDING_SOURCE,
        {
            "service": "WFS",
            "version": "2.0.0",
            "request": "GetFeature",
            "typeNames": "budynki",
            "count": MAX_FEATURES,
            "srsName": CRS,
            "bbox": bbox,
        },
    )
    try:
        return parse_buildings(body, point, datetime.now(UTC))
    except (ElementTree.ParseError, KeyError, TypeError, ValueError) as exc:
        raise HTTPException(502, "Nie udało się odczytać obrysów budynków z EGiB.") from exc

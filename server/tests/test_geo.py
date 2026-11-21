"""Independent address, coordinate and failure cases for the GUGiK adapters."""

from base64 import b64decode
from hashlib import sha256
from random import Random
from struct import pack
from zlib import compress, crc32

import httpx
import pytest
from fastapi.testclient import TestClient

from server import geo
from server.app import app, request_window

MARKER = {
    "label": "Miejscowość testowa, Próbna 12",
    "region": "00-001 · region testowy",
    "easting_m": 500000,
    "northing_m": 500000,
}
FEATURE = """
<wfs:member>
  <ms:budynki>
    <ms:geom>
      <gml:Polygon srsName="{crs}">
        <gml:exterior><gml:LinearRing><gml:posList>
          500006 {west} 500006 {east} 500010 {east} 500010 {west} 500006 {west}
        </gml:posList></gml:LinearRing></gml:exterior>
      </gml:Polygon>
    </ms:geom>
    <ms:ID_BUDYNKU>{id}</ms:ID_BUDYNKU>
  </ms:budynki>
</wfs:member>
"""


def feature_collection(*features, truncated=False):
    attrs = ' next="ignored"' if truncated else ""
    members = "".join(features)
    return f"""<wfs:FeatureCollection xmlns:wfs="{geo.NS["wfs"]}" xmlns:ms="{geo.NS["ms"]}"
        xmlns:gml="{geo.NS["gml"]}" numberReturned="{len(features)}"{attrs}>
{members}</wfs:FeatureCollection>"""


@pytest.fixture
def api_client(monkeypatch):
    monkeypatch.setenv("BIPV_GEODATA_ENABLED", "1")
    geo.geo_requests.clear()
    request_window.clear()
    with TestClient(app) as client:
        yield client
    request_window.clear()
    geo.geo_requests.clear()


def upstream_transport(monkeypatch, handler):
    monkeypatch.setattr(app.state, "http", httpx.AsyncClient(transport=httpx.MockTransport(handler)))


def test_address_candidates_have_distinct_projected_points_and_no_cache(api_client, monkeypatch):
    def handler(request):
        assert request.url.host == "services.gugik.gov.pl"
        assert dict(request.url.params) == {"request": "GetAddress", "address": "Próbna 12"}
        return httpx.Response(
            200,
            json={
                "type": "address",
                "returned objects": 2,
                "results": {
                    "1": {"city": "A", "street": "Próbna", "number": "12", "x": "500000", "y": "500100"},
                    "2": {"city": "B", "street": "Próbna", "number": "12", "x": "550000", "y": "580000"},
                },
            },
        )

    upstream_transport(monkeypatch, handler)
    result = api_client.post("/api/geo/addresses", json={"address": "  Próbna 12  "})
    assert result.status_code == 200
    assert result.headers["cache-control"] == "no-store"
    a, b = result.json()["candidates"]
    assert [p["label"] for p in (a, b)] == ["A, Próbna 12", "B, Próbna 12"]
    assert (b["easting_m"], b["northing_m"]) == (550000, 580000)
    assert "selected" not in result.json()


def test_wfs_axes_sorting_reference_and_truncation(api_client, monkeypatch):
    marker = {**MARKER, "northing_m": 500002}
    far = FEATURE.format(crs=geo.CRS, west=500020, east=500026, id="TEST_FAR")
    near = FEATURE.format(crs=geo.CRS, west=499997, east=500003, id="TEST_NEAR")

    def handler(request):
        assert request.url.host == "mapy.geoportal.gov.pl"
        assert request.url.params["bbox"] == f"499942.0,499940.0,500062.0,500060.0,{geo.CRS}"
        return httpx.Response(200, text=feature_collection(far, near, truncated=True))

    upstream_transport(monkeypatch, handler)
    result = api_client.post("/api/geo/buildings", json=marker)
    assert result.status_code == 200
    report = result.json()
    assert report["partial"] is True
    assert report["radius_m"] == 60
    first, second = report["candidates"]
    assert [c["site"]["building_id"] for c in (first, second)] == ["TEST_NEAR", "TEST_FAR"]
    assert "selected" not in report
    assert first["distance_m"] == 4
    assert first["area_m2"] == 24
    assert first["rings_m"][0][0] == [[-3, 4], [3, 4], [3, 8], [-3, 8], [-3, 4]]
    # EPSG:2180 easting 500000 lies on the central meridian at 19 E.
    assert first["site"]["longitude_deg"] == 19
    assert 52 < first["site"]["latitude_deg"] < 53
    assert first["site"]["address"] == marker["label"]
    assert first["site"]["source"] == "gugik-egib-wfs"

    saved = api_client.post(
        "/api/scene/v2/validate",
        json={"schema_version": "2.0.0", "geometry": {}, "site": first["site"]},
    )
    assert saved.status_code == 200
    assert saved.json()["site"] == first["site"]
    assert "rings_m" not in saved.json()["site"]


@pytest.mark.parametrize(
    ("body", "status"),
    [
        (feature_collection(), 200),
        ("<ows:ExceptionReport xmlns:ows='http://www.opengis.net/ows/1.1'/>", 502),
        (feature_collection(FEATURE.format(crs="EPSG:4326", west=499997, east=500003, id="TEST")), 502),
        ("<!DOCTYPE xml><xml/>", 502),
    ],
)
def test_wfs_no_coverage_is_distinct_from_bad_provider_data(api_client, monkeypatch, body, status):
    upstream_transport(monkeypatch, lambda _: httpx.Response(200, text=body))
    response = api_client.post("/api/geo/buildings", json=MARKER)
    assert response.status_code == status
    if status == 200:
        assert response.json()["candidates"] == []
        assert not response.json()["partial"]


def test_disabled_source_and_limits_prevent_a_provider_request(api_client, monkeypatch):
    upstream_transport(monkeypatch, lambda _: pytest.fail("Provider should not be called"))
    monkeypatch.setenv("BIPV_GEODATA_ENABLED", "0")
    sources = api_client.get("/api/geo/sources").json()
    assert not sources["enabled"]
    assert {entry["retention"] for entry in sources["sources"]} == {"selected_reference", "dialog_only"}
    assert api_client.post("/api/geo/buildings", json=MARKER).status_code == 503
    assert api_client.post("/api/geo/orthophoto", json={"easting_m": 20, "northing_m": 30}).status_code == 503
    monkeypatch.setenv("BIPV_GEODATA_ENABLED", "1")
    geo.geo_requests.extend([geo.monotonic()] * 30)
    assert api_client.post("/api/geo/buildings", json=MARKER).status_code == 429


@pytest.mark.parametrize("failure", ["rate", "timeout", "size", "restricted"])
def test_provider_failure_is_reported_without_a_fictional_result(api_client, monkeypatch, failure):
    def handler(request):
        if failure == "rate":
            return httpx.Response(429)
        if failure == "restricted":
            return httpx.Response(403)
        if failure == "timeout":
            raise httpx.ReadTimeout("fixture", request=request)
        return httpx.Response(200, content=b"x" * (geo.MAX_BYTES + 1))

    upstream_transport(monkeypatch, handler)
    result = api_client.post("/api/geo/buildings", json=MARKER)
    assert result.status_code == {"rate": 429, "timeout": 504, "size": 502, "restricted": 502}[failure]
    assert "candidates" not in result.json()
    if failure == "restricted":
        assert "nie udostępnił danych" in result.json()["detail"]


def png_fixture(size=600, *, detailed=False):
    def chunk(kind, data):
        return pack(">I", len(data)) + kind + data + pack(">I", crc32(kind + data))

    random = Random(202507)
    pixels = b"".join(
        b"\0" + (random.randbytes(size * 3) if detailed else b"\x9d\xc0\xa1" * size) for _ in range(size)
    )
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
        + chunk(b"IDAT", compress(pixels))
        + chunk(b"IEND", b"")
    )


def test_orthophoto_georeference_uses_wms_axes_and_preserves_spatial_frame(api_client, monkeypatch):
    imagery = png_fixture(detailed=True)
    assert len(imagery) > 512 * 1024

    def handler(request):
        assert request.url.host == "mapy.geoportal.gov.pl"
        assert request.url.path == "/wss/service/PZGIK/ORTO/WMS/StandardResolution"
        params = request.url.params
        assert params["VERSION"] == "1.3.0" and params["REQUEST"] == "GetMap"
        assert params["CRS"] == "EPSG:2180" and params["LAYERS"] == "Raster"
        assert params["BBOX"] == "483524.0,674187.0,483644.0,674307.0"
        assert params["WIDTH"] == params["HEIGHT"] == "600"
        return httpx.Response(200, content=imagery, headers={"Content-Type": "image/png"})

    upstream_transport(monkeypatch, handler)
    response = api_client.post("/api/geo/orthophoto", json={"easting_m": 674247, "northing_m": 483584})
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    payload = response.json()
    assert payload["crs"] == "EPSG:2180"
    assert payload["bounds_m"] == {"west": 674187, "south": 483524, "east": 674307, "north": 483644}
    assert payload["source"]["kind"] == "orthophoto" and payload["source"]["retention"] == "dialog_only"
    assert payload["width_px"] == payload["height_px"] == 600
    assert payload["grid_m_per_pixel"] == 0.2
    assert b64decode(payload["image_base64"], validate=True) == imagery
    assert payload["sha256"] == sha256(imagery).hexdigest()


@pytest.mark.parametrize(
    ("body", "reason"),
    [
        (b"<ServiceExceptionReport/>", "nieprawidłowy obraz"),
        (png_fixture(60), "nieprawidłowy obraz"),
        (png_fixture()[:-1], "nieprawidłowy obraz"),
        (png_fixture() + b"trailing content", "nieprawidłowy obraz"),
        (b"X" * 1_500_001, "za duża"),
    ],
    ids=["provider-error", "incorrect-dimensions", "truncated", "extra-content", "body-limit"],
)
def test_orthophoto_rejects_invalid_provider_responses(api_client, monkeypatch, body, reason):
    upstream_transport(monkeypatch, lambda _: httpx.Response(200, content=body))
    response = api_client.post("/api/geo/orthophoto", json={"easting_m": 674247, "northing_m": 483584})
    assert response.status_code == 502
    assert reason in response.json()["detail"]
    assert "image_base64" not in response.json()

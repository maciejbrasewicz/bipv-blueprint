"""Independent address, coordinate and failure cases for the GUGiK adapters."""

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
    assert {entry["retention"] for entry in sources["sources"]} == {"selected_reference"}
    assert api_client.post("/api/geo/buildings", json=MARKER).status_code == 503
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

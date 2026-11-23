"""Collect real Studio HTTP outputs for the PV and OBJ assessment."""

import hashlib
import json
import sys

import httpx


def checked_layout(data: dict, variant: str) -> dict:
    layout = next(v for v in data["variants"] if v["id"] == variant)
    count = layout["module_count"]
    if count != len(layout["placements"]):
        raise ValueError("Layout count disagrees with the exported placements")
    return layout


def geometry_evidence(data: dict, layout: dict, model: bytes) -> dict:
    obj = model.decode("utf-8")
    if f"# source_sha256 {data['source_hash']}" not in obj.splitlines():
        raise ValueError("OBJ and layout refer to different scenes")
    placements = {
        item["id"]: {key: item[key] for key in ("surface_id", "u", "v", "width_m", "height_m")}
        for item in layout["placements"]
    }
    if layout["module_count"] != len(placements):
        raise ValueError("Layout contains repeated module IDs")
    return {
        "obj": obj,
        "obj_sha256": hashlib.sha256(model).hexdigest(),
        "placements": placements,
        "layout_power_kwp": layout["power_kwp"],
    }


def collect(base_url: str, criterion: str, payload: dict) -> dict:
    response = httpx.post(f"{base_url.rstrip('/')}/api/layout", json=payload["scene"], timeout=120)
    response.raise_for_status()
    data = response.json()
    layout = checked_layout(data, payload["variant"])
    if criterion == "I-02":
        count = layout["module_count"]
        return {
            "report_sha256": hashlib.sha256(response.content).hexdigest(),
            "modules_by_type": {data["product"]["id"]: count} if count else {},
        }
    model = httpx.post(f"{base_url.rstrip('/')}/api/model.obj", json=payload, timeout=120)
    model.raise_for_status()
    return geometry_evidence(data, layout, model.content)


def main() -> int:
    base_url, criterion, _case_id = sys.argv[1:]
    if criterion not in {"I-02", "I-03-geometry"}:
        return 2
    print(json.dumps(collect(base_url, criterion, json.load(sys.stdin))))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

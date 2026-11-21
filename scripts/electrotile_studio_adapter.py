"""Reference I-02 adapter for a Studio test instance."""

import hashlib
import json
import sys

import httpx


def main() -> int:
    base_url, criterion, _case_id = sys.argv[1:]
    if criterion != "I-02":
        return 2
    payload = json.load(sys.stdin)
    response = httpx.post(f"{base_url.rstrip('/')}/api/layout", json=payload["scene"], timeout=120)
    response.raise_for_status()
    data = response.json()
    layout = next(v for v in data["variants"] if v["id"] == payload["variant"])
    count = layout["module_count"]
    if count != len(layout["placements"]):
        raise ValueError("Layout count disagrees with the exported placements")
    print(
        json.dumps(
            {
                "report_sha256": hashlib.sha256(response.content).hexdigest(),
                "modules_by_type": {data["product"]["id"]: count} if count else {},
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

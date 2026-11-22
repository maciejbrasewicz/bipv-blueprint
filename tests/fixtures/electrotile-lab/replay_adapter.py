"""Synthetic upstream. Drops deliberately injected failures in the retest mode."""

import json
import sys
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Lock
from time import perf_counter_ns


def book(double_book: bool) -> tuple[list[dict], list[str]]:
    barrier, lock = Barrier(2), Lock()
    saved = []

    def attempt(actor):
        started = perf_counter_ns()
        barrier.wait(timeout=3)
        with lock:
            booking = None
            if double_book or not saved:
                booking = f"booking-{actor}"
                saved.append(booking)
        return {
            "request_id": f"booking-call-{actor}",
            "customer_id": f"fixture-customer-{actor}",
            "slot_id": "fixture-slot",
            "started_ns": started,
            "finished_ns": perf_counter_ns(),
            "outcome": "confirmed" if booking else "slot_taken",
            "booking_id": booking,
        }

    with ThreadPoolExecutor(max_workers=2) as executor:
        return list(executor.map(attempt, ("a", "b"))), saved


def classic_product(fixture, faulty):
    metadata = {key: fixture[key] for key in ("design_revision", "catalog_revision")}
    mock_catalog = {
        "full": ("lab-classic-full", 8),
        "half-left": ("lab-classic-half-left", 4),
        "half-right": ("lab-classic-half-right", 4),
        "passive": ("lab-classic-passive", 0),
    }
    sheets = {}
    for zone, activity in fixture["pattern"].items():
        sku, micropanels = mock_catalog[activity]
        trim = {"left": 30} if activity == "half-right" else {}
        sheets[zone] = {
            "sku": sku,
            "activity": activity,
            "micropanels": micropanels,
            "trim_mm": trim,
            "nominal_mm": [1191, 840],
            "effective_mm": [1157, 820],
        }
    quantities = Counter(sheet["sku"] for sheet in sheets.values())
    active = [zone for zone, sheet in sheets.items() if sheet["micropanels"]]
    nominal = sum(sheet["micropanels"] * 12_500 for sheet in sheets.values())
    result = {
        "design": {**metadata, "sheets": sheets, "stc_mwp": nominal},
        "bom": {**metadata, "quantities": quantities.copy()},
        "electrical": {**metadata, "strings": {"series-1": active} if active else {}},
        "offer": {**metadata, "quantities": quantities.copy()},
    }
    if faulty and active:
        right = sheets["edge-west"]
        right.update(activity="half-left", sku="lab-classic-half-left", trim_mm={"right": 30})
        sheets["central"]["effective_mm"] = [1191, 840]
        result["bom"]["quantities"]["lab-classic-passive"] = 2
        result["electrical"]["strings"]["series-1"] = ["central", "edge-west", "edge-west", "infill"]
        result["offer"]["design_revision"] = "design-r1"
        del result["offer"]["quantities"]["lab-classic-half-right"]
    elif faulty:
        sheets["infill"]["micropanels"] = 4
        result["design"]["stc_mwp"] = 50_000
        result["electrical"]["strings"] = {"series-1": ["infill"]}
    return result


def observed(fixture, mode):
    bad = mode == "faulty"
    stage = fixture["scenario"]
    if stage == "classic-product":
        return classic_product(fixture, bad)
    if stage == "materials":
        return {
            "stock": [
                {
                    "id": "stock-1",
                    "profile": "ALU",
                    "length_mm": 6000,
                    "kerf_passes": 0 if bad else 2,
                    "scrap_mm": 500 if bad else 494,
                    "cuts": [
                        {
                            "id": "cut-A",
                            "profile": "ALU",
                            "length_mm": 3000,
                            "angle_a_mdeg": 0,
                            "angle_b_mdeg": 45_000,
                        },
                        {
                            "id": "cut-B",
                            "profile": "ALU",
                            "length_mm": 2500,
                            "angle_a_mdeg": 45_000,
                            "angle_b_mdeg": 0,
                        },
                    ],
                }
            ],
            "bom": {"ALU": 1, "CLAMP": 3 if bad else 4},
        }
    if stage == "harness":
        return {
            "wires": {
                "wire-A": {
                    "start": "A",
                    "end": "C",
                    "cable_sku": "PV-CABLE",
                    "connector_start": "M",
                    "connector_end": "F",
                    "segments": ["edge-1", "edge-2"],
                    "length_mm": 2900 if bad else 6200,
                }
            }
        }
    if stage == "workflow":
        bookings, saved = book(bad)
        return {
            "original_media_sha256": "a" * 64,
            "after_replace_media_sha256": "b" * 64,
            "original_media_readable_after_replace": False,
            "media_readable_after_delete": False,
            "published_offer_sha256_before_edit": "c" * 64,
            "published_offer_sha256_after_edit": ("d" if bad else "c") * 64,
            "orders": [
                {
                    "request_id": f"order-call-{i}",
                    "idempotency_key": "order-intent",
                    "offer_revision": "offer-r1",
                    "order_id": "order-2" if i == 2 and bad else "order-1",
                    "amount_minor": 235400,
                    "currency": "PLN",
                }
                for i in (1, 2)
            ],
            "persisted_order_ids": ["order-1", "order-2"] if bad else ["order-1"],
            "bookings": bookings,
            "persisted_booking_ids": saved,
        }
    if stage == "rejection":
        return {"rejection_code": "pattern_outside_range"}
    raise ValueError(f"Unknown synthetic response type: {stage}")


if __name__ == "__main__":
    mode, criterion, case_id = sys.argv[1:]
    print(json.dumps(observed(json.load(sys.stdin), mode)))

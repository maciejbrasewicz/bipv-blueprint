"""Generate a traceable material takeoff and cable routing from a specified design."""

import json
from collections import Counter, defaultdict
from hashlib import sha256
from heapq import heappop, heappush
from itertools import count
from typing import Annotated, Literal

from pydantic import Field, model_validator

from .models import StrictModel

Code = Annotated[str, Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$")]
Length = Annotated[int, Field(strict=True, ge=1, le=100_000)]
Nonnegative = Annotated[int, Field(strict=True, ge=0, le=1_000_000)]
Angle = Annotated[int, Field(strict=True, ge=-180_000, le=180_000)]
Edge = Literal["left", "right", "top", "bottom"]


class SheetProduct(StrictModel):
    activity: Literal["full", "half-left", "half-right", "half-top", "half-bottom", "passive"]
    nominal_mm: tuple[Length, Length]
    effective_mm: tuple[Length, Length]
    micropanels: Nonnegative
    stc_mwp: Nonnegative
    trim_limits_mm: dict[Edge, Length] = Field(default_factory=dict)

    @model_validator(mode="after")
    def check_specification(self):
        if any(e > n for e, n in zip(self.effective_mm, self.nominal_mm, strict=True)):
            raise ValueError("Effective dimensions exceed nominal dimensions")
        passive = self.activity == "passive"
        if passive != (self.micropanels == 0) or passive != (self.stc_mwp == 0):
            raise ValueError("Micropanels and rated power must match the activity")
        return self


class Sheet(StrictModel):
    sku: Code
    trim_mm: dict[Edge, Length] = Field(default_factory=dict)


class Profile(StrictModel):
    length_mm: Length
    kerf_mm: Annotated[int, Field(strict=True, ge=0, le=30)]
    passes_per_piece: Literal[1, 2]


class Cut(StrictModel):
    profile: Code
    length_mm: Length
    angle_a_mdeg: Angle
    angle_b_mdeg: Angle


class Segment(StrictModel):
    start: Code
    end: Code
    length_mm: Length


class Circuit(StrictModel):
    sheet_ids: Annotated[list[Code], Field(min_length=1, max_length=128)]
    start: Code
    end: Code
    cable_sku: Code
    reserve_mm: Nonnegative


class ProductionInput(StrictModel):
    design_revision: Code
    catalog_revision: Code
    sheet_catalog: Annotated[dict[Code, SheetProduct], Field(min_length=1, max_length=32)]
    sheets: Annotated[dict[Code, Sheet], Field(min_length=1, max_length=128)]
    profiles: Annotated[dict[Code, Profile], Field(max_length=24)]
    cuts: Annotated[dict[Code, Cut], Field(max_length=256)]
    ports: Annotated[dict[Code, Code], Field(max_length=96)]
    segments: Annotated[dict[Code, Segment], Field(max_length=256)]
    circuits: Annotated[dict[Code, Circuit], Field(max_length=32)]


class PlanRejected(ValueError):
    def __init__(self, code: str, item: str):
        self.code = code
        self.item = item
        super().__init__(f"{code}: {item}")


def design_sheets(job: ProductionInput) -> dict:
    design = {}
    for id_, sheet in sorted(job.sheets.items()):
        product = job.sheet_catalog.get(sheet.sku)
        if product is None:
            raise PlanRejected("unknown_sheet_sku", id_)
        if any(depth > product.trim_limits_mm.get(edge, 0) for edge, depth in sheet.trim_mm.items()):
            raise PlanRejected("trim_limit", id_)
        design[id_] = {
            **sheet.model_dump(mode="json"),
            **product.model_dump(
                mode="json", include={"activity", "nominal_mm", "effective_mm", "micropanels", "stc_mwp"}
            ),
        }
    return design


def cut_stock(job: ProductionInput) -> list[dict]:
    stocks: dict[str, list[dict]] = defaultdict(list)
    cuts = sorted(job.cuts.items(), key=lambda item: (item[1].profile, -item[1].length_mm, item[0]))
    for id_, cut in cuts:
        profile = job.profiles.get(cut.profile)
        if profile is None:
            raise PlanRejected("unknown_profile", id_)
        consumed = cut.length_mm + profile.passes_per_piece * profile.kerf_mm
        if consumed > profile.length_mm:
            raise PlanRejected("cut_exceeds_stock", id_)
        batches = stocks[cut.profile]
        stock = next((batch for batch in batches if batch["scrap_mm"] >= consumed), None)
        if stock is None:
            stock = {
                "profile": cut.profile,
                "length_mm": profile.length_mm,
                "kerf_passes": 0,
                "scrap_mm": profile.length_mm,
                "cuts": [],
            }
            batches.append(stock)
        stock["kerf_passes"] += profile.passes_per_piece
        stock["scrap_mm"] -= consumed
        stock["cuts"].append({"id": id_, **cut.model_dump()})
    stock_list = [stock for batches in stocks.values() for stock in batches]
    for number, stock in enumerate(stock_list, 1):
        stock["id"] = f"stock-{number}"
    return stock_list


def shortest_route(
    graph: dict[str, list[tuple[str, Segment]]], start: str, end: str
) -> tuple[int, list[str]] | None:
    order = count()
    pending = [(0, next(order), start, [])]
    best = {start: 0}
    while pending:
        length, _, node, path = heappop(pending)
        if node == end:
            return length, path
        if best[node] != length:
            continue
        for id_, segment in graph.get(node, []):
            candidate = length + segment.length_mm
            if segment.end not in best or candidate < best[segment.end]:
                best[segment.end] = candidate
                heappush(pending, (candidate, next(order), segment.end, [*path, id_]))
    return None


def wire_routes(job: ProductionInput, sheets: dict) -> dict:
    active = {id_ for id_, sheet in sheets.items() if sheet["activity"] != "passive"}
    connected = Counter(sheet for circuit in job.circuits.values() for sheet in circuit.sheet_ids)
    if connected != Counter(active):
        raise PlanRejected("active_sheet_membership", "circuits")

    graph = defaultdict(list)
    for id_, segment in sorted(job.segments.items()):
        graph[segment.start].append((id_, segment))

    wires = {}
    used_ports = set()
    for id_, circuit in sorted(job.circuits.items()):
        ends = {circuit.start, circuit.end}
        if len(ends) != 2 or not ends <= job.ports.keys() or ends & used_ports:
            raise PlanRejected("invalid_ports", id_)
        route = shortest_route(graph, circuit.start, circuit.end)
        if route is None:
            raise PlanRejected("route_missing", id_)
        distance, path = route
        used_ports.update(ends)
        wires[id_] = {
            "start": circuit.start,
            "end": circuit.end,
            "cable_sku": circuit.cable_sku,
            "connector_start": job.ports[circuit.start],
            "connector_end": job.ports[circuit.end],
            "segments": path,
            "length_mm": distance + circuit.reserve_mm,
        }
    return wires


def build_plan(job: ProductionInput) -> dict:
    sheets = design_sheets(job)
    stock = cut_stock(job)
    wires = wire_routes(job, sheets)
    canonical_input = json.dumps(job.model_dump(mode="json"), sort_keys=True, separators=(",", ":"))
    return {
        "input_sha256": sha256(canonical_input.encode()).hexdigest(),
        "design_revision": job.design_revision,
        "catalog_revision": job.catalog_revision,
        "sheets": sheets,
        "stc_mwp": sum(item["stc_mwp"] for item in sheets.values()),
        "sheet_bom": dict(Counter(item["sku"] for item in sheets.values())),
        "profile_bom": dict(Counter(item["profile"] for item in stock)),
        "stock": stock,
        "strings": {id_: circuit.sheet_ids for id_, circuit in sorted(job.circuits.items())},
        "wires": wires,
    }

"""Independent checks for normalized Electrotile functional evidence."""

from collections import Counter
from itertools import pairwise
from typing import Annotated, Literal

from pydantic import Field, model_validator

from .check_electrotile_run import CaseID, Count, Digest, Record, Tick

MM = Annotated[int, Field(ge=0)]
Angle = Annotated[int, Field(ge=-180_000, le=180_000)]


class Cut(Record):
    id: CaseID
    profile: CaseID
    length_mm: Count
    angle_a_mdeg: Angle
    angle_b_mdeg: Angle


class Stock(Record):
    id: CaseID
    profile: CaseID
    length_mm: Count
    kerf_passes: MM
    scrap_mm: MM
    cuts: list[Cut] = Field(min_length=1)


class ProfileRule(Record):
    stock_lengths_mm: list[Count] = Field(min_length=1)
    kerf_mm: MM
    passes_per_piece: MM


class MaterialsReference(Record):
    profiles: dict[CaseID, ProfileRule]
    cuts: dict[CaseID, Cut]
    bom: dict[CaseID, Count]

    @model_validator(mode="after")
    def reference_cuts_use_known_profiles(self):
        if any(id_ != cut.id or cut.profile not in self.profiles for id_, cut in self.cuts.items()):
            raise ValueError("Frozen cuts must have matching IDs and known profile SKUs")
        return self


class MaterialsObserved(Record):
    stock: list[Stock]
    bom: dict[CaseID, Count]


class Segment(Record):
    start: CaseID
    end: CaseID
    length_mm: Count


class WireSpec(Record):
    start: CaseID
    end: CaseID
    cable_sku: CaseID
    connector_start: CaseID
    connector_end: CaseID
    reserve_mm: MM
    approved_routes: list[list[CaseID]] = Field(min_length=1)


class Wire(Record):
    start: CaseID
    end: CaseID
    cable_sku: CaseID
    connector_start: CaseID
    connector_end: CaseID
    segments: list[CaseID] = Field(min_length=1)
    length_mm: Count


class HarnessReference(Record):
    segments: dict[CaseID, Segment]
    wires: dict[CaseID, WireSpec]
    length_tolerance_mm: MM

    @model_validator(mode="after")
    def reference_routes_connect_the_expected_ports(self):
        for wire in self.wires.values():
            for route in wire.approved_routes:
                if not route or set(route) - self.segments.keys():
                    raise ValueError("Frozen routes must contain known segments")
                segments = [self.segments[id_] for id_ in route]
                if (
                    segments[0].start != wire.start
                    or segments[-1].end != wire.end
                    or any(a.end != b.start for a, b in pairwise(segments))
                ):
                    raise ValueError("Frozen routes must connect the expected ports in order")
        return self


class HarnessObserved(Record):
    wires: dict[CaseID, Wire]


class Rejection(Record):
    rejection_code: CaseID


class RejectionReference(Record):
    rejection_codes: list[CaseID] = Field(min_length=1)


class OrderAttempt(Record):
    request_id: CaseID
    idempotency_key: CaseID
    offer_revision: CaseID
    order_id: CaseID
    amount_minor: MM
    currency: Literal["PLN", "EUR"]


class BookingAttempt(Record):
    request_id: CaseID
    customer_id: CaseID
    slot_id: CaseID
    started_ns: Tick
    finished_ns: Tick
    outcome: Literal["confirmed", "slot_taken"]
    booking_id: CaseID | None = None


class WorkflowReference(Record):
    published_offer_revision: CaseID
    published_offer_sha256: Digest
    amount_minor: MM
    currency: Literal["PLN", "EUR"]
    replacement_media_sha256: Digest
    slot_id: CaseID


class WorkflowObserved(Record):
    original_media_sha256: Digest
    after_replace_media_sha256: Digest
    original_media_readable_after_replace: bool
    media_readable_after_delete: bool
    published_offer_sha256_before_edit: Digest
    published_offer_sha256_after_edit: Digest
    orders: list[OrderAttempt] = Field(min_length=2, max_length=2)
    persisted_order_ids: list[CaseID]
    bookings: list[BookingAttempt] = Field(min_length=2, max_length=2)
    persisted_booking_ids: list[CaseID]


class Defect(Record):
    code: CaseID
    subject: CaseID
    expected: object
    actual: object


def check_materials(expected: MaterialsReference, observed: MaterialsObserved) -> list[Defect]:
    defects = []
    duplicate_stock = Counter(item.id for item in observed.stock)
    cut_counts = Counter(cut.id for item in observed.stock for cut in item.cuts)
    for id_ in sorted(set(cut_counts) | set(expected.cuts)):
        count = int(id_ in expected.cuts)
        if cut_counts[id_] != count:
            defects.append(Defect(code="cut_count", subject=id_, expected=count, actual=cut_counts[id_]))
    for stock in observed.stock:
        if duplicate_stock[stock.id] != 1:
            defects.append(
                Defect(code="duplicate_stock", subject=stock.id, expected=1, actual=duplicate_stock[stock.id])
            )
        rule = expected.profiles.get(stock.profile)
        if rule is None or stock.length_mm not in rule.stock_lengths_mm:
            allowed = rule.stock_lengths_mm if rule else []
            defects.append(
                Defect(code="invalid_stock", subject=stock.id, expected=allowed, actual=stock.length_mm)
            )
        else:
            expected_passes = rule.passes_per_piece * len(stock.cuts)
            if stock.kerf_passes != expected_passes:
                defects.append(
                    Defect(
                        code="kerf_pass_count",
                        subject=stock.id,
                        expected=expected_passes,
                        actual=stock.kerf_passes,
                    )
                )
            # Use the reference rule in the physical balance, even when the observed pass count is false.
            consumed = sum(cut.length_mm for cut in stock.cuts) + expected_passes * rule.kerf_mm
            if consumed + stock.scrap_mm != stock.length_mm:
                defects.append(
                    Defect(
                        code="stock_balance",
                        subject=stock.id,
                        expected=stock.length_mm,
                        actual=consumed + stock.scrap_mm,
                    )
                )
        for cut in stock.cuts:
            wanted = expected.cuts.get(cut.id)
            if wanted is not None and cut != wanted:
                defects.append(
                    Defect(
                        code="cut_dimensions",
                        subject=cut.id,
                        expected=wanted.model_dump(),
                        actual=cut.model_dump(),
                    )
                )
            if stock.profile != cut.profile:
                defects.append(
                    Defect(
                        code="cut_stock_profile", subject=cut.id, expected=cut.profile, actual=stock.profile
                    )
                )
    for sku in sorted(set(expected.bom) | set(observed.bom)):
        if expected.bom.get(sku, 0) != observed.bom.get(sku, 0):
            defects.append(
                Defect(
                    code="bom_quantity",
                    subject=sku,
                    expected=expected.bom.get(sku, 0),
                    actual=observed.bom.get(sku, 0),
                )
            )
    return defects


def check_harness(expected: HarnessReference, observed: HarnessObserved) -> list[Defect]:
    defects = []
    for id_ in sorted(set(expected.wires) ^ set(observed.wires)):
        defects.append(
            Defect(
                code="wire_inventory",
                subject=id_,
                expected=id_ in expected.wires,
                actual=id_ in observed.wires,
            )
        )
    for id_ in sorted(expected.wires.keys() & observed.wires.keys()):
        target = expected.wires[id_]
        wire = observed.wires[id_]
        fields = {"start", "end", "cable_sku", "connector_start", "connector_end"}
        if target.model_dump(include=fields) != wire.model_dump(include=fields):
            defects.append(
                Defect(
                    code="wire_endpoints_or_sku",
                    subject=id_,
                    expected=target.model_dump(include=fields),
                    actual=wire.model_dump(include=fields),
                )
            )
        if wire.segments not in target.approved_routes:
            defects.append(
                Defect(code="wire_route", subject=id_, expected=target.approved_routes, actual=wire.segments)
            )
            continue
        segments = [expected.segments[key] for key in wire.segments]
        length = sum(s.length_mm for s in segments) + target.reserve_mm
        if abs(wire.length_mm - length) > expected.length_tolerance_mm:
            defects.append(
                Defect(
                    code="wire_length_mm",
                    subject=id_,
                    expected={"mm": length, "tolerance_mm": expected.length_tolerance_mm},
                    actual=wire.length_mm,
                )
            )
    return defects


def check_workflow(expected: WorkflowReference, observed: WorkflowObserved) -> list[Defect]:
    defects = []

    def check(code, subject, wanted, actual):
        if wanted != actual:
            defects.append(Defect(code=code, subject=subject, expected=wanted, actual=actual))

    check("media_replace", "upload", expected.replacement_media_sha256, observed.after_replace_media_sha256)
    check(
        "media_changed", "upload", True, observed.original_media_sha256 != observed.after_replace_media_sha256
    )
    check("obsolete_media_visible", "upload", False, observed.original_media_readable_after_replace)
    check("deleted_media_visible", "upload", False, observed.media_readable_after_delete)
    check(
        "published_snapshot_original",
        "offer",
        expected.published_offer_sha256,
        observed.published_offer_sha256_before_edit,
    )
    check(
        "published_snapshot_mutated",
        "offer",
        expected.published_offer_sha256,
        observed.published_offer_sha256_after_edit,
    )
    first, retry = observed.orders
    check("order_distinct_requests", "order", True, first.request_id != retry.request_id)
    check("order_retry_key", "order", first.idempotency_key, retry.idempotency_key)
    check("order_retry_duplicate", "order", first.order_id, retry.order_id)
    check("order_persisted", "order", [first.order_id], observed.persisted_order_ids)
    for order in observed.orders:
        check(
            "order_offer_revision", order.request_id, expected.published_offer_revision, order.offer_revision
        )
        check("order_price_minor", order.request_id, expected.amount_minor, order.amount_minor)
        check("order_currency", order.request_id, expected.currency, order.currency)

    a, b = observed.bookings
    check(
        "booking_distinct_requests",
        "booking",
        True,
        a.request_id != b.request_id and a.customer_id != b.customer_id,
    )
    check("booking_same_slot", "booking", [expected.slot_id, expected.slot_id], [a.slot_id, b.slot_id])
    check(
        "booking_requests_overlap",
        "booking",
        True,
        max(a.started_ns, b.started_ns) < min(a.finished_ns, b.finished_ns),
    )
    check("booking_exclusivity", "booking", ["confirmed", "slot_taken"], sorted([a.outcome, b.outcome]))
    confirmed = sorted(
        item.booking_id for item in observed.bookings if item.outcome == "confirmed" and item.booking_id
    )
    check("booking_confirmation_id", "booking", 1, len(confirmed))
    check(
        "booking_ghost_confirmation",
        "booking",
        True,
        all(item.booking_id is None for item in observed.bookings if item.outcome != "confirmed"),
    )
    check("booking_persisted", "booking", confirmed, sorted(observed.persisted_booking_ids))
    return defects

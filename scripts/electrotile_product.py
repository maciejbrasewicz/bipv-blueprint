"""Compare an integrated BIPV design, product BOM, wiring and quote with a frozen project."""

from collections import Counter
from typing import Annotated, Literal

from pydantic import Field, model_validator

from .check_electrotile_run import CaseID, Count, Record
from .electrotile_checks import Defect

Edge = Literal["left", "right", "top", "bottom"]
Activity = Literal["full", "half-left", "half-right", "half-top", "half-bottom", "passive"]
Nonnegative = Annotated[int, Field(ge=0)]


class Product(Record):
    activity: Activity
    nominal_mm: tuple[Count, Count]
    effective_mm: tuple[Count, Count]
    micropanels: Nonnegative
    stc_mwp: Nonnegative
    trim_limits_mm: dict[Edge, Count] = Field(default_factory=dict)

    @model_validator(mode="after")
    def product_values_are_consistent(self):
        if any(
            effective > nominal for effective, nominal in zip(self.effective_mm, self.nominal_mm, strict=True)
        ):
            raise ValueError("Effective coverage cannot exceed the nominal sheet dimensions")
        passive = self.activity == "passive"
        if passive != (self.micropanels == 0) or passive != (self.stc_mwp == 0):
            raise ValueError("Only passive sheets can have no micropanels and no rated power")
        return self


class PlannedSheet(Record):
    sku: CaseID
    trim_mm: dict[Edge, Count] = Field(default_factory=dict)


class ProductReference(Record):
    design_revision: CaseID
    catalog_revision: CaseID
    catalog: dict[CaseID, Product] = Field(min_length=1)
    sheets: dict[CaseID, PlannedSheet] = Field(min_length=1)

    @model_validator(mode="after")
    def reference_uses_approved_products_and_cuts(self):
        for sheet in self.sheets.values():
            if sheet.sku not in self.catalog:
                raise ValueError("Frozen sheet references an unknown SKU")
            limits = self.catalog[sheet.sku].trim_limits_mm
            if any(depth > limits.get(edge, 0) for edge, depth in sheet.trim_mm.items()):
                raise ValueError("Frozen sheet exceeds the permitted trim depth")
        return self


class DesignSheet(PlannedSheet):
    activity: Activity
    nominal_mm: tuple[Count, Count]
    effective_mm: tuple[Count, Count]
    micropanels: Nonnegative


class Stage(Record):
    design_revision: CaseID
    catalog_revision: CaseID


class Design(Stage):
    sheets: dict[CaseID, DesignSheet]
    stc_mwp: Nonnegative


class ProductLines(Stage):
    quantities: dict[CaseID, Count]


class Electrical(Stage):
    strings: dict[CaseID, Annotated[list[CaseID], Field(min_length=1)]]


class ProductEvidence(Record):
    design: Design
    bom: ProductLines
    electrical: Electrical
    offer: ProductLines


def check_product(reference: ProductReference, observed: ProductEvidence) -> list[Defect]:
    defects = []

    def compare(code, subject, expected, actual):
        if actual != expected:
            defects.append(Defect(code=code, subject=subject, expected=expected, actual=actual))

    for stage_name in ("design", "bom", "electrical", "offer"):
        stage = getattr(observed, stage_name)
        compare("design_revision", stage_name, reference.design_revision, stage.design_revision)
        compare("catalog_revision", stage_name, reference.catalog_revision, stage.catalog_revision)

    expected_skus = Counter(sheet.sku for sheet in reference.sheets.values())
    wired = Counter(sheet_id for members in observed.electrical.strings.values() for sheet_id in members)
    design = observed.design.sheets
    for sheet_id in sorted(reference.sheets.keys() | design.keys() | wired.keys()):
        planned, actual = reference.sheets.get(sheet_id), design.get(sheet_id)
        compare("sheet_present", sheet_id, planned is not None, actual is not None)
        product = reference.catalog[planned.sku] if planned else None
        compare(
            "string_memberships",
            sheet_id,
            int(product is not None and product.micropanels > 0),
            wired[sheet_id],
        )
        if planned is None or product is None or actual is None:
            continue
        compare("sheet_sku", sheet_id, planned.sku, actual.sku)
        compare("active_pattern", sheet_id, product.activity, actual.activity)
        compare("nominal_mm", sheet_id, product.nominal_mm, actual.nominal_mm)
        compare("effective_mm", sheet_id, product.effective_mm, actual.effective_mm)
        compare("micropanel_count", sheet_id, product.micropanels, actual.micropanels)
        compare("trim_mm", sheet_id, planned.trim_mm, actual.trim_mm)
        excess = {
            edge: depth
            for edge, depth in actual.trim_mm.items()
            if depth > product.trim_limits_mm.get(edge, 0)
        }
        if excess:
            defects.append(
                Defect(
                    code="trim_outside_approval",
                    subject=sheet_id,
                    expected=product.trim_limits_mm,
                    actual=excess,
                )
            )

    stc_mwp = sum(reference.catalog[sheet.sku].stc_mwp for sheet in reference.sheets.values())
    compare("stc_mwp", "design", stc_mwp, observed.design.stc_mwp)
    for stage_name, quantities in (("bom", observed.bom.quantities), ("offer", observed.offer.quantities)):
        for sku in sorted(expected_skus.keys() | quantities.keys()):
            compare(f"{stage_name}_quantity", sku, expected_skus[sku], quantities.get(sku, 0))
    return defects

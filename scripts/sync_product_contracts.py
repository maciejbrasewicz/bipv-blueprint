"""Generate versioned JSON Schema from the product Pydantic models."""

import argparse
import json
from pathlib import Path

from server.product_contracts import PRODUCT_CONTRACTS

CONTRACTS = Path(__file__).resolve().parents[1] / "contracts"


def schema_text(model) -> str:
    return (
        json.dumps(
            {"$schema": "https://json-schema.org/draft/2020-12/schema", **model.model_json_schema()},
            ensure_ascii=False,
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    for name, model in PRODUCT_CONTRACTS.items():
        path = CONTRACTS / f"{name}.schema.json"
        schema = schema_text(model)
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != schema:
                parser.exit(1, f"Schema out of date: {path.name}\n")
        else:
            path.write_text(schema, encoding="utf-8")

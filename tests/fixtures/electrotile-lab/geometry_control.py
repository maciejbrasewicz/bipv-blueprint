"""Deliberately damage collected Studio evidence to verify the checks reject it."""

import hashlib
import json
import subprocess
import sys


def mutate(evidence: dict, mode: str, case_id: str) -> dict:
    if mode == "clean" or (mode == "opening" and case_id != "survey-pitched-opening"):
        return evidence
    if mode == "power-units":
        return {**evidence, "layout_power_kwp": evidence["layout_power_kwp"] * 1000}
    if mode == "layout-shift":
        first, *other = evidence["placements"].items()
        key, placement = first
        return {**evidence, "placements": {key: {**placement, "u": placement["u"] + 0.01}, **dict(other)}}

    lines = evidence["obj"].splitlines()
    first_surface_face = next(index for index, line in enumerate(lines) if line.startswith("f "))
    match mode:
        case "scale":
            for index, line in enumerate(lines):
                if line.startswith("v "):
                    lines[index] = "v " + " ".join(str(float(axis) * 1000) for axis in line.split()[1:])
        case "winding":
            vertices = lines[first_surface_face].split()[1:]
            lines[first_surface_face] = "f " + " ".join(reversed(vertices))
        case "duplicate-face":
            lines.insert(first_surface_face, lines[first_surface_face])
        case "opening":
            first_module = next(i for i, line in enumerate(lines) if line.startswith("g module_"))
            vertices = range(first_module + 1, first_module + 5)
            # This measured point is the lower UV corner of the fixture opening, at module height.
            target = (13.25, 3.426, 8.507)
            origin = tuple(float(axis) for axis in lines[first_module + 1].split()[1:])
            delta = [a - b for a, b in zip(target, origin, strict=True)]
            for index in vertices:
                point = [float(axis) for axis in lines[index].split()[1:]]
                lines[index] = "v " + " ".join(str(a + b) for a, b in zip(point, delta, strict=True))
        case _:
            raise ValueError(f"Unknown geometry control: {mode}")
    obj = "\n".join(lines) + "\n"
    return {**evidence, "obj": obj, "obj_sha256": hashlib.sha256(obj.encode()).hexdigest()}


if __name__ == "__main__":
    mode, base_url, criterion, case_id = sys.argv[1:]
    result = subprocess.run(
        [sys.executable, "-m", "scripts.electrotile_studio_adapter", base_url, criterion, case_id],
        input=sys.stdin.buffer.read(),
        capture_output=True,
        check=True,
    )
    print(json.dumps(mutate(json.loads(result.stdout), mode, case_id)))

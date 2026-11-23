"""Read exported footprint walls for the fixed, analytical ET/2025/7 demonstration case."""

import json
from collections import defaultdict
from hashlib import sha256
from itertools import pairwise
from math import dist
from struct import iter_unpack, unpack_from

from .electrotile_geometry import Point3, read_obj

WALL_GROUP = "walls_egib-roof-1"
METRES_PER_GRID_METRE = 1 / 0.9993
ASSUMED_HEIGHT_M = 6


def glb_wall_faces(model: bytes) -> list[list[Point3]]:
    magic, version, size = unpack_from("<4sII", model)
    text_size, text_tag = unpack_from("<I4s", model, 12)
    binary_size, binary_tag = unpack_from("<I4s", model, 20 + text_size)
    if (magic, version, size) != (b"glTF", 2, len(model)) or (text_tag, binary_tag) != (b"JSON", b"BIN\0"):
        raise ValueError("Nieprawidłowy format GLB 2.0")
    document = json.loads(model[20 : 20 + text_size])
    data = model[28 + text_size :]
    if binary_size != len(data):
        raise ValueError("Rozmiar danych binarnych GLB się nie zgadza")
    nodes = [node for node in document["nodes"] if node.get("name") == WALL_GROUP]
    if not nodes:
        return []
    (node,) = nodes
    (primitive,) = document["meshes"][node["mesh"]]["primitives"]
    positions = document["accessors"][primitive["attributes"]["POSITION"]]
    if primitive["mode"] != 4 or "indices" in primitive or positions["componentType"] != 5126:
        raise ValueError("Niezgodny zapis trójkątów ścian w GLB")
    view = document["bufferViews"][positions["bufferView"]]
    start = view.get("byteOffset", 0) + positions.get("byteOffset", 0)
    end = start + positions["count"] * 12
    if end > len(data):
        raise ValueError("Niekompletne współrzędne ścian w GLB")
    coordinates = iter_unpack("<fff", data[start:end])
    return [list(face) for face in zip(coordinates, coordinates, coordinates, strict=True)]


def wall_evidence(model: bytes, rings: list, *, is_glb: bool) -> tuple[dict, dict]:
    faces = glb_wall_faces(model) if is_glb else read_obj(model.decode()).get(WALL_GROUP, [])
    vertices = [
        (e * METRES_PER_GRID_METRE, -n * METRES_PER_GRID_METRE) for ring in rings for e, n in ring[:-1]
    ]
    ring_edges = [
        tuple(
            sorted(
                (
                    (a[0] * METRES_PER_GRID_METRE, -a[1] * METRES_PER_GRID_METRE),
                    (b[0] * METRES_PER_GRID_METRE, -b[1] * METRES_PER_GRID_METRE),
                )
            )
        )
        for ring in rings
        for a, b in pairwise(ring)
    ]
    covered = defaultdict(list)
    valid_faces = set()
    for face in faces:
        if len(face) != 3 or {point[1] for point in face} != {0, ASSUMED_HEIGHT_M}:
            continue
        projected = []
        for east, height, south in face:
            nearest = min(vertices, key=lambda candidate: dist(candidate, (east, south)))
            if dist(nearest, (east, south)) >= 0.00002:
                break
            projected.append((nearest, height))
        edge = tuple(sorted({point for point, _ in projected}))
        if len(set(projected)) == 3 and edge in ring_edges:
            triangle = tuple(sorted(projected))
            if triangle not in valid_faces:
                valid_faces.add(triangle)
                covered[edge].append(set(triangle))

    def full_quad(triangles):
        if len(triangles) != 2:
            return False
        shared = triangles[0] & triangles[1]
        return len({point for point, _ in shared}) == len({height for _, height in shared}) == 2

    expected = {
        "trójkąty ścian": 2 * len(ring_edges),
        "poprawne trójkąty": 2 * len(ring_edges),
        "krawędzie z pełną ścianą": len(ring_edges),
    }
    actual = {
        "trójkąty ścian": len(faces),
        "poprawne trójkąty": len(valid_faces),
        "krawędzie z pełną ścianą": sum(full_quad(covered[edge]) for edge in ring_edges),
    }
    return expected, {**actual, "SHA-256": sha256(model).hexdigest()}

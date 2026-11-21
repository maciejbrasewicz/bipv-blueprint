"""Binary glTF for the validated layout and its nominal surface geometry."""

import json
from collections import defaultdict
from math import hypot
from struct import Struct, pack

from .geometry import compute
from .model_export import rectangle, render_point, surface_faces
from .models import ModelExport, Obstacle

VEC3 = Struct("<3f")
MATERIALS = {
    "roof": [0.70, 0.72, 0.68, 1],
    "facade": [0.72, 0.68, 0.61, 1],
    "pv": [0.055, 0.12, 0.19, 1],
    "chimney": [0.58, 0.37, 0.28, 1],
    "skylight": [0.26, 0.42, 0.50, 1],
}
Vec3 = tuple[float, float, float]


def fan(points: list[Vec3]):
    for i in range(1, len(points) - 1):
        yield points[0], points[i], points[i + 1]


def obstacle_triangles(plane: dict, obstacle: Obstacle):
    boundary = rectangle(obstacle.u, obstacle.v, obstacle.width_m, obstacle.depth_m)
    bottom = [render_point(plane, u, v, 0.02) for u, v in boundary]
    east, north, up = plane["normal"]
    direction = (0, 1, 0) if obstacle.kind == "chimney" and up > 1e-6 else (east, up, -north)
    top = [
        (
            x + direction[0] * obstacle.height_m,
            y + direction[1] * obstacle.height_m,
            z + direction[2] * obstacle.height_m,
        )
        for x, y, z in bottom
    ]
    yield from fan(list(reversed(bottom)))
    yield from fan(top)
    for i in range(4):
        j = (i + 1) % 4
        yield from fan([bottom[i], bottom[j], top[j], top[i]])


def normal(a: Vec3, b: Vec3, c: Vec3) -> Vec3 | None:
    x, y, z = (b[i] - a[i] for i in range(3))
    u, v, w = (c[i] - a[i] for i in range(3))
    cross = (y * w - z * v, z * u - x * w, x * v - y * u)
    size = hypot(*cross)
    return (cross[0] / size, cross[1] / size, cross[2] / size) if size else None


class Glb:
    def __init__(self, result: dict, variant: str | None):
        self.binary = bytearray()
        self.nodes = []
        self.meshes = []
        self.accessors = []
        self.views = []
        self.metadata = {
            "sourceSha256": result["source_hash"],
            "engine": result["engine_version"],
            "variant": variant,
            "frame": "X=East,Y=Up,Z=-North",
        }

    def add_vectors(self, vectors: list[Vec3], *, position: bool = False) -> int:
        offset = len(self.binary)
        for point in vectors:
            self.binary.extend(VEC3.pack(*point))
        self.views.append(
            {"buffer": 0, "byteOffset": offset, "byteLength": len(self.binary) - offset, "target": 34962}
        )
        accessor = {
            "bufferView": len(self.views) - 1,
            "componentType": 5126,
            "count": len(vectors),
            "type": "VEC3",
        }
        if position:
            axes = list(zip(*vectors, strict=True))
            accessor.update(min=[min(axis) for axis in axes], max=[max(axis) for axis in axes])
        self.accessors.append(accessor)
        return len(self.accessors) - 1

    def add_mesh(self, name: str, material: str, triangles, extras: dict) -> None:
        positions, normals = [], []
        for triangle in triangles:
            # Bounds and normals are computed from the float32 values actually stored.
            points = [VEC3.unpack(VEC3.pack(*vertex)) for vertex in triangle]
            direction = normal(*points)
            if direction is not None:
                positions.extend(points)
                normals.extend([direction] * 3)
        if not positions:
            return
        primitive = {
            "attributes": {
                "POSITION": self.add_vectors(positions, position=True),
                "NORMAL": self.add_vectors(normals),
            },
            "material": list(MATERIALS).index(material),
            "mode": 4,
        }
        self.nodes.append({"name": name, "mesh": len(self.meshes), "extras": extras})
        self.meshes.append({"primitives": [primitive]})

    def encode(self) -> bytes:
        managed = {
            "asset": {"version": "2.0", "generator": "Registry9 BIPV Studio", "extras": self.metadata},
            "scene": 0,
            "scenes": [{"nodes": list(range(len(self.nodes)))}],
            "nodes": self.nodes,
            "meshes": self.meshes,
            "materials": [
                {
                    "name": name,
                    "doubleSided": name in {"roof", "facade", "pv"},
                    "pbrMetallicRoughness": {
                        "baseColorFactor": color,
                        "metallicFactor": 0.0,
                        "roughnessFactor": 0.8,
                    },
                }
                for name, color in MATERIALS.items()
            ],
            "accessors": self.accessors,
            "bufferViews": self.views,
            "buffers": [{"byteLength": len(self.binary)}],
        }
        document = json.dumps(managed, separators=(",", ":"), allow_nan=False).encode()
        document += b" " * (-len(document) % 4)
        header = pack("<4sII", b"glTF", 2, 28 + len(document) + len(self.binary))
        return b"".join(
            (
                header,
                pack("<I4s", len(document), b"JSON"),
                document,
                pack("<I4s", len(self.binary), b"BIN\0"),
                self.binary,
            )
        )


def export_glb(body: ModelExport) -> bytes:
    result = compute(body.scene)
    glb = Glb(result, body.variant)
    planes = {s["id"]: s for s in result["surfaces"]}
    for id_, plane in planes.items():
        triangles = (tuple(render_point(plane, u, v) for u, v in points) for points in surface_faces(plane))
        glb.add_mesh(f"surface_{id_}", plane["kind"], triangles, {"surfaceId": id_, "role": "surface"})
    for obstacle in body.scene.obstacles:
        glb.add_mesh(
            f"obstacle_{obstacle.id}",
            obstacle.kind,
            obstacle_triangles(planes[obstacle.surface_id], obstacle),
            {"surfaceId": obstacle.surface_id, "obstacleId": obstacle.id, "role": obstacle.kind},
        )
    if body.variant is not None:
        selected = next(v for v in result["variants"] if v["id"] == body.variant)
        batches = defaultdict(list)
        for panel in selected["placements"]:
            batches[panel["surface_id"]].append(panel)
        for id_, panels in batches.items():
            triangles = []
            for panel in panels:
                points = rectangle(panel["u"], panel["v"], panel["width_m"], panel["height_m"])
                triangles.extend(fan([render_point(planes[id_], u, v, 0.045) for u, v in points]))
            glb.add_mesh(
                f"pv_{id_}",
                "pv",
                triangles,
                {"surfaceId": id_, "moduleIds": [p["id"] for p in panels], "role": "pv"},
            )
    return glb.encode()

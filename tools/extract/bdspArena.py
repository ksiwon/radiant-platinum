"""BDSP 배틀 무대 번들 → glb (PLAN §4.3, DATA.md §7.4).

    py -3.13 tools/extract/bdspArena.py <번들> -o public/models/arena/<이름>.glb

BDSP의 배틀 배경은 **진짜 3D 무대**다. `Environments/bg/arenas/ground/g001`
하나에 정적 메시 158개와 텍스처 21장(흙·풀·나무)이 들어 있고, 그 위에 하늘
(`arenas/sky/s0xx`)이 따로 얹힌다. 우리 배틀은 여태 원판 두 개를 띄워 놓고
있었는데, 원작(BDSP)은 **둘이 같은 땅에 서 있다**.

⚠️ **인물 번들과 다르다.** `bdspGlb.py`는 `SkinnedMeshRenderer` + 뼈대를 다루고
여기는 `MeshFilter` + `Transform` 계층뿐이다. 뼈가 없으므로 **월드 행렬을 정점에
구워 넣고** 재질별로 합친다 — 메시 158개를 노드 158개로 두면 드로우콜이 그만큼
난다.

⚠️ **좌표계는 X 뒤집기다.** `bdspGlb.py`와 같은 이유다(그쪽 머리말): Unity는
왼손, glTF는 오른손이고 우리 엔진은 +Z가 정면이다. 손잡이가 뒤집히므로 삼각형
감기 순서도 함께 뒤집는다.

⚠️ **큰 것을 통째로 굽지 않는다.** 번들 하나가 압축 8.4MB고 여는 즉시 그보다
커진다. `--far`로 잘라 낼 거리를 주면 무대 한가운데에서 그보다 먼 메시를 버린다 —
배틀 카메라는 한가운데 20m 안쪽만 본다.
"""
from __future__ import annotations

import argparse
import json
import struct
import sys
from pathlib import Path

import numpy as np
import UnityPy
from UnityPy.helpers import MeshHelper

from bdsp_bake_albedo import bake

GLB_MAGIC = 0x46546C67
JSON_CHUNK = 0x4E4F534A
BIN_CHUNK = 0x004E4942

FLOAT = 5126
USHORT = 5123
UINT = 5125
ARRAY, ELEMENT = 34962, 34963


class Buffer:
    """접근자를 붙여 가며 바이너리 한 덩이를 쌓는다 (`bdspGlb`와 같은 규격)."""

    def __init__(self) -> None:
        self.blob = bytearray()
        self.views: list[dict] = []
        self.accessors: list[dict] = []

    def view(self, data: bytes, target: int | None = None) -> int:
        while len(self.blob) % 4:
            self.blob.append(0)
        v = {"buffer": 0, "byteOffset": len(self.blob), "byteLength": len(data)}
        if target is not None:
            v["target"] = target
        self.blob += data
        self.views.append(v)
        return len(self.views) - 1

    def add(self, array: np.ndarray, kind: str, comp: int, target: int | None = None,
            minmax: bool = False) -> int:
        acc = {
            "bufferView": self.view(array.tobytes(), target),
            "componentType": comp,
            "count": int(array.shape[0]),
            "type": kind,
        }
        if minmax:
            flat = array.reshape(array.shape[0], -1)
            acc["min"] = [float(v) for v in flat.min(axis=0)]
            acc["max"] = [float(v) for v in flat.max(axis=0)]
        self.accessors.append(acc)
        return len(self.accessors) - 1


def trs(t) -> np.ndarray:
    """Transform 하나의 로컬 행렬 (Unity 좌표계 그대로)."""
    p = t.m_LocalPosition
    q = t.m_LocalRotation
    s = t.m_LocalScale
    x, y, z, w = q.x, q.y, q.z, q.w
    rot = np.array([
        [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
        [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
        [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ], dtype=np.float64)
    m = np.eye(4)
    m[:3, :3] = rot * np.array([s.x, s.y, s.z], dtype=np.float64)
    m[:3, 3] = [p.x, p.y, p.z]
    return m


def world_of(t, cache: dict) -> np.ndarray:
    """부모를 타고 올라가 월드 행렬을 만든다. 뼈가 없으므로 이걸 정점에 굽는다."""
    pid = t.object_reader.path_id
    if pid in cache:
        return cache[pid]
    m = trs(t)
    father = getattr(t, "m_Father", None)
    if father is not None and getattr(father, "m_PathID", 0) != 0:
        try:
            m = world_of(father.read(), cache) @ m
        except Exception:
            pass
    cache[pid] = m
    return m


def lanes(raw, n: int, want: int, fallback: list[float]) -> np.ndarray:
    """정점당 `want`개 값으로 편다. 없거나 개수가 안 맞으면 `fallback`으로 채운다.

    ⚠️ **성분 개수가 3이라고 가정하면 안 된다.** BDSP 무대 메시의 법선 스트림이
    정점당 4성분으로 들어 있는 것이 있다(`g001`에서 10,444 = 2,611 × 4). 그대로
    3으로 접으면 reshape이 터진다
    """
    if raw is None:
        return np.tile(np.array(fallback, dtype=np.float64), (n, 1))
    a = np.asarray(raw, dtype=np.float64).reshape(-1)
    if n == 0 or a.size % n != 0 or a.size // n < want:
        return np.tile(np.array(fallback, dtype=np.float64), (n, 1))
    return a.reshape(n, -1)[:, :want].copy()


def export(bundle: Path, out: Path, far: float | None) -> dict:
    env = UnityPy.load(str(bundle))
    filters = [o.read() for o in env.objects if o.type.name == "MeshFilter"]
    if not filters:
        raise SystemExit(f"{bundle.name}: MeshFilter가 없다")

    buf = Buffer()

    # 알베도는 번들 통째로 한 번만 굽는다. BDSP 셰이더를 런타임에 재현하지 않기
    # 위해서다 (`bdsp_bake_albedo` 머리말)
    albedo = out.parent / f".{out.stem}_albedo"
    images, textures, materials, by_name = [], [], [], {}
    bake(bundle, albedo, None)
    for png in sorted(albedo.glob("*_albedo.png")):
        name = png.name[: -len("_albedo.png")]
        images.append({
            "bufferView": buf.view(png.read_bytes()), "mimeType": "image/png", "name": name,
        })
        textures.append({"source": len(images) - 1})
        materials.append({
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": len(textures) - 1},
                "metallicFactor": 0.0,
                "roughnessFactor": 0.9,
            },
            # 나무·풀은 오려 낸 그림이다. 불투명으로 두면 잎 사이가 사각형으로 막힌다
            "alphaMode": "MASK",
            "alphaCutoff": 0.5,
            "doubleSided": True,
        })
        by_name[name] = len(materials) - 1
        png.unlink()
    if albedo.is_dir():
        albedo.rmdir()

    cache: dict = {}
    # 재질별로 모은다 — 메시 158개를 그대로 두면 드로우콜이 158개다
    parts: dict[int, list[tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]]] = {}
    dropped = 0
    kept = 0
    for mf in filters:
        try:
            mesh = mf.m_Mesh.read()
        except Exception:
            continue
        go = mf.m_GameObject.read()
        renderer = None
        for c in go.m_Components:
            try:
                comp = c.read()
            except Exception:
                continue
            if comp.object_reader.type.name == "MeshRenderer":
                renderer = comp
                break
        if renderer is None:
            continue
        try:
            transform = go.m_Transform.read()
        except Exception:
            continue
        world = world_of(transform, cache)

        handler = MeshHelper.MeshHandler(mesh)
        handler.process()
        n = len(handler.m_Vertices)
        if n == 0:
            continue
        verts = np.array(handler.m_Vertices, dtype=np.float64).reshape(-1, 3)
        verts = (world[:3, :3] @ verts.T).T + world[:3, 3]
        if far is not None and float(np.min(np.hypot(verts[:, 0], verts[:, 2]))) > far:
            dropped += 1
            continue
        kept += 1
        normals = lanes(handler.m_Normals, n, 3, [0.0, 1.0, 0.0])
        normals = (world[:3, :3] @ normals.T).T
        length = np.linalg.norm(normals, axis=1, keepdims=True)
        normals = np.where(length > 1e-9, normals / np.maximum(length, 1e-9), [0.0, 1.0, 0.0])
        uv = lanes(handler.m_UV0, n, 2, [0.0, 0.0]).astype(np.float32)
        # Unity는 UV 원점이 왼쪽 아래, glTF는 왼쪽 위다
        uv = np.stack([uv[:, 0], 1.0 - uv[:, 1]], axis=1).astype(np.float32)
        # X 뒤집기 (머리말)
        verts[:, 0] *= -1
        normals[:, 0] *= -1

        indices = np.array(handler.m_IndexBuffer, dtype=np.uint32)
        mats = list(renderer.m_Materials)
        for i, sub in enumerate(mesh.m_SubMeshes):
            first = sub.firstByte // (2 if mesh.m_IndexFormat == 0 else 4)
            tri = indices[first: first + sub.indexCount].reshape(-1, 3)
            # X를 뒤집었으므로 감기 순서를 되돌린다
            tri = tri[:, ::-1].copy()
            slot = -1
            if i < len(mats):
                try:
                    slot = by_name.get(mats[i].read().m_Name, -1)
                except Exception:
                    slot = -1
            parts.setdefault(slot, []).append((
                verts.astype(np.float32), normals.astype(np.float32), uv, tri,
            ))

    primitives = []
    total_v = total_t = 0
    for slot, chunks in sorted(parts.items()):
        pos, nrm, tex, idx = [], [], [], []
        base = 0
        for v, nn, u, t in chunks:
            pos.append(v)
            nrm.append(nn)
            tex.append(u)
            idx.append(t + base)
            base += v.shape[0]
        pos = np.concatenate(pos)
        nrm = np.concatenate(nrm)
        tex = np.concatenate(tex)
        idx = np.concatenate(idx)
        total_v += pos.shape[0]
        total_t += idx.shape[0]
        prim = {
            "attributes": {
                "POSITION": buf.add(pos, "VEC3", FLOAT, ARRAY, minmax=True),
                "NORMAL": buf.add(nrm, "VEC3", FLOAT, ARRAY),
                "TEXCOORD_0": buf.add(tex, "VEC2", FLOAT, ARRAY),
            },
            # 색인은 정점이 65,536개 안쪽이면 16비트로 넣는다 — 무대 하나에서
            # 0.8MB가 빠진다. glTF는 둘 다 허용한다
            "indices": (
                buf.add(idx.reshape(-1).astype(np.uint16), "SCALAR", USHORT, ELEMENT)
                if pos.shape[0] <= 65536
                else buf.add(idx.reshape(-1).astype(np.uint32), "SCALAR", UINT, ELEMENT)
            ),
            "mode": 4,
        }
        if slot >= 0:
            prim["material"] = slot
        primitives.append(prim)

    gltf = {
        "asset": {"version": "2.0", "generator": "radiant-platinum bdspArena"},
        "scene": 0,
        "scenes": [{"nodes": [0]}],
        "nodes": [{"name": bundle.name, "mesh": 0}],
        "meshes": [{"name": bundle.name, "primitives": primitives}],
        "materials": materials,
        "textures": textures,
        "images": images,
        "accessors": buf.accessors,
        "bufferViews": buf.views,
        "buffers": [{"byteLength": len(buf.blob)}],
    }
    write_glb(out, gltf, bytes(buf.blob))

    every = np.concatenate([c[0] for chunks in parts.values() for c in chunks])
    return {
        "메시": kept,
        "버린 메시": dropped,
        "정점": int(total_v),
        "삼각형": int(total_t),
        "재질": len(materials),
        "드로우콜": len(primitives),
        "가로": round(float(every[:, 0].max() - every[:, 0].min()), 2),
        "높이": round(float(every[:, 1].max() - every[:, 1].min()), 2),
        "세로": round(float(every[:, 2].max() - every[:, 2].min()), 2),
        "바닥 y": round(float(np.percentile(every[:, 1], 1)), 3),
        "바이트": out.stat().st_size,
    }


def write_glb(path: Path, gltf: dict, blob: bytes) -> None:
    body = json.dumps(gltf, separators=(",", ":")).encode()
    body += b" " * (-len(body) % 4)
    blob += b"\0" * (-len(blob) % 4)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("wb") as f:
        f.write(struct.pack("<III", GLB_MAGIC, 2, 12 + 8 + len(body) + 8 + len(blob)))
        f.write(struct.pack("<II", len(body), JSON_CHUNK))
        f.write(body)
        f.write(struct.pack("<II", len(blob), BIN_CHUNK))
        f.write(blob)


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("bundle", type=Path)
    ap.add_argument("-o", "--out", type=Path, required=True)
    ap.add_argument("--far", type=float, default=None,
                    help="무대 한가운데에서 이보다 먼 메시는 버린다 (m)")
    args = ap.parse_args()
    stat = export(args.bundle, args.out, args.far)
    print(args.out)
    for k, v in stat.items():
        print(f"  {k}: {v}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

"""BDSP 인물 번들 → glb (PLAN §4.3).

    py -3.13 tools/extract/bdspGlb.py <번들> -o public/models/npc/<이름>.glb

번들 하나가 자급자족이다 — 메시·스켈레톤·머티리얼·텍스처가 다 들어 있다.
여기서 꺼내 glTF 2.0 바이너리 한 덩이로 쓴다. Blender를 안 거친다:
`dawn_to_glb.py`는 받아 온 `.dae`를 Blender에 물리는 길이라 우리가 뽑은
번들에는 못 쓴다.

⚠️ **좌표계를 X 뒤집기 하나로 옮긴다.** Unity는 왼손, glTF는 오른손이고,
그냥 Z를 뒤집으면(교과서적인 변환) 모델이 glTF 정면인 −Z를 보게 된다. 우리
엔진은 `facing = atan2(vx, vz)`라 **+Z가 정면**이어야 하고(§4.3, dawn.glb도
그렇다), 그래서 Z 뒤집기 + Y축 180° 회전을 합친 것과 같은 **X 뒤집기**를 쓴다.
손잡이가 뒤집히므로 삼각형 감기 순서도 함께 뒤집는다 — 안 뒤집으면 안팎이
뒤집혀 얼굴 안쪽이 보인다.

⚠️ **애니메이션은 아직 못 넣는다.** 클립이 Mecanim의 `m_MuscleClip`(스트림
압축)이라 UnityPy가 커브를 안 펴 준다. 지금 나오는 것은 번들에 저장된 **쉬는
자세**(A 포즈)다. 팔이 어깨에서 36° 내려와 있어서 서 있는 사람으로는 쓸 만하지만,
숨쉬기도 걷기도 없다.
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


class Buffer:
    """접근자를 붙여 가며 바이너리 한 덩이를 쌓는다."""

    def __init__(self) -> None:
        self.blob = bytearray()
        self.views: list[dict] = []
        self.accessors: list[dict] = []

    def _view(self, data: bytes, target: int | None = None) -> int:
        # glTF는 접근자 오프셋이 요소 크기의 배수여야 한다. 4로 맞춰 두면 다 든다
        while len(self.blob) % 4:
            self.blob.append(0)
        view = {"buffer": 0, "byteOffset": len(self.blob), "byteLength": len(data)}
        if target is not None:
            view["target"] = target
        self.blob += data
        self.views.append(view)
        return len(self.views) - 1

    def add(self, array: np.ndarray, kind: str, comp: int, target: int | None = None,
            minmax: bool = False) -> int:
        view = self._view(array.tobytes(), target)
        acc = {
            "bufferView": view,
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


def flip_x(a: np.ndarray) -> np.ndarray:
    """X를 뒤집는다. 위 머리말의 좌표계 변환이다."""
    out = a.copy()
    out[:, 0] *= -1
    return out


def quat_flip_x(q: tuple[float, float, float, float]) -> list[float]:
    """X 뒤집기를 회전에 옮긴다. 축의 X만 남고 Y·Z가 뒤집힌다."""
    x, y, z, w = q
    return [x, -y, -z, w]


def bone_tree(bones: list) -> tuple[list[dict], dict[int, int]]:
    """Transform 목록을 glTF 노드로. 부모가 목록 밖이면 루트다."""
    index = {b.object_reader.path_id: i for i, b in enumerate(bones)}
    nodes: list[dict] = []
    for b in bones:
        p, r, s = b.m_LocalPosition, b.m_LocalRotation, b.m_LocalScale
        node: dict = {
            "name": bone_name(b),
            "translation": [-p.x, p.y, p.z],
            "rotation": quat_flip_x((r.x, r.y, r.z, r.w)),
            "scale": [s.x, s.y, s.z],
        }
        kids = [index[c.m_PathID] for c in b.m_Children if c.m_PathID in index]
        if kids:
            node["children"] = kids
        nodes.append(node)
    return nodes, index


def bone_name(t) -> str:
    try:
        return t.m_GameObject.read().m_Name
    except Exception:
        return "bone"


def export(bundle: Path, out: Path, color_index: int | None = None) -> dict:
    env = UnityPy.load(str(bundle))
    smrs = [o.read() for o in env.objects if o.type.name == "SkinnedMeshRenderer"]
    if not smrs:
        raise SystemExit(f"{bundle.name}: SkinnedMeshRenderer가 없다")

    # 껍데기가 하나가 아니다. 트레이너(`tr####`)는 `baseSkin` 하나뿐이지만
    # 주인공(`pc####`)은 여섯이다 — 몸·머리 두 벌·신발 두 벌·손목시계.
    # 처음에 첫 번째만 꺼냈더니 정점 178개짜리 **손목시계 하나**가 glb로
    # 나왔다. 재어 보고 알았다: 키가 0.056m였다
    buf = Buffer()
    ARRAY, ELEMENT = 34962, 34963

    # 뼈대는 한 벌이다. 여러 껍데기가 같은 Transform을 나눠 쓰므로 먼저 합친다
    seen = {}
    for smr in smrs:
        for b in smr.m_Bones:
            t = b.read()
            seen.setdefault(t.object_reader.path_id, t)
    bones = list(seen.values())
    nodes, index = bone_tree(bones)
    child = {c for n in nodes for c in n.get("children", [])}
    roots = [i for i in range(len(nodes)) if i not in child]

    # 알베도는 번들 통째로 한 번만 굽는다
    albedo = out.parent / f".{out.stem}_albedo"
    bake(bundle, albedo, color_index)
    images, textures, materials, by_name = [], [], [], {}
    for png in sorted(albedo.glob("*_albedo.png")):
        name = png.name[: -len("_albedo.png")]
        view = buf._view(png.read_bytes())
        images.append({"bufferView": view, "mimeType": "image/png", "name": name})
        textures.append({"source": len(images) - 1})
        materials.append({
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": len(textures) - 1},
                "metallicFactor": 0.0,
                "roughnessFactor": 0.85,
            },
            "alphaMode": "MASK",
            "alphaCutoff": 0.5,
            "doubleSided": False,
        })
        by_name[name] = len(materials) - 1
        png.unlink()
    albedo.rmdir()

    meshes, skins, verts_all, written = [], [], [], []
    for smr in smrs:
        mesh = smr.m_Mesh.read()
        handler = MeshHelper.MeshHandler(mesh)
        handler.process()

        verts = flip_x(np.array(handler.m_Vertices, dtype=np.float32).reshape(-1, 3))
        normals = flip_x(np.array(handler.m_Normals, dtype=np.float32).reshape(-1, 3))
        uv = np.array(handler.m_UV0, dtype=np.float32).reshape(-1, 2)
        # Unity는 UV 원점이 왼쪽 아래, glTF는 왼쪽 위다
        uv = np.stack([uv[:, 0], 1.0 - uv[:, 1]], axis=1).astype(np.float32)
        # ⚠️ **스킨 정보가 없는 껍데기가 섞여 있다**(tr0030_00에서 나왔다).
        # 뼈 하나에 통째로 매달린 딱딱한 메시라 가중치 배열이 아예 없다.
        # 그런 것은 0번 뼈에 100%로 묶는다 — 그 뼈를 따라 통째로 움직인다
        rigid = handler.m_BoneWeights is None or handler.m_BoneIndices is None
        count = len(handler.m_Vertices)
        if rigid:
            joints = np.zeros((count, 4), dtype=np.uint16)
            weights = np.zeros((count, 4), dtype=np.float32)
            weights[:, 0] = 1.0
        else:
            joints = np.array(handler.m_BoneIndices, dtype=np.uint16).reshape(-1, 4)
            weights = np.array(handler.m_BoneWeights, dtype=np.float32).reshape(-1, 4)
        # 합이 1이 아닌 정점이 섞여 있다(손목시계에서 89개 나왔다). glTF는 합이
        # 1이어야 하고, 안 맞으면 그 정점만 쪼그라든다
        total = weights.sum(axis=1, keepdims=True)
        weights = np.where(total > 0, weights / np.maximum(total, 1e-8), weights)
        weights[total[:, 0] == 0, 0] = 1.0
        # ⚠️ **JOINTS_0을 노드 번호로 바꾸면 안 된다.** glTF에서 이 값은 노드가
        # 아니라 **그 스킨의 `joints` 배열 안 자리**다. 노드 번호로 옮겼더니
        # 주인공(껍데기 여섯)에서 "관절이 스킨을 넘는다"가 14건 떴다.
        # 옮겨야 하는 것은 `joints` 배열 쪽이다
        remap = np.array(
            [index[b.read().object_reader.path_id] for b in smr.m_Bones], dtype=np.uint16,
        )
        joints = np.clip(joints, 0, max(0, len(remap) - 1))
        indices = np.array(handler.m_IndexBuffer, dtype=np.uint32)

        a_pos = buf.add(verts, "VEC3", FLOAT, ARRAY, minmax=True)
        a_nrm = buf.add(normals, "VEC3", FLOAT, ARRAY)
        a_uv = buf.add(uv, "VEC2", FLOAT, ARRAY)
        a_joint = buf.add(joints, "VEC4", USHORT, ARRAY)
        a_weight = buf.add(weights, "VEC4", FLOAT, ARRAY)

        mats = [m.read() for m in smr.m_Materials]
        primitives = []
        for i, sub in enumerate(mesh.m_SubMeshes):
            # 시작 위치가 **인덱스 번호가 아니라 바이트 오프셋**이다(`firstByte`).
            # 16비트 버퍼라 2로 나눠야 몇 번째 인덱스인지가 나온다
            first = sub.firstByte // (2 if mesh.m_IndexFormat == 0 else 4)
            tri = indices[first: first + sub.indexCount].reshape(-1, 3)
            # X를 뒤집었으므로 감기 순서를 되돌린다. 안 하면 안팎이 뒤집힌다
            tri = tri[:, ::-1].copy()
            written.append((verts, tri))
            prim = {
                "attributes": {
                    "POSITION": a_pos, "NORMAL": a_nrm, "TEXCOORD_0": a_uv,
                    "JOINTS_0": a_joint, "WEIGHTS_0": a_weight,
                },
                "indices": buf.add(tri.reshape(-1).astype(np.uint32), "SCALAR", UINT, ELEMENT),
                "mode": 4,
            }
            mat = by_name.get(mats[i].m_Name if i < len(mats) else "")
            if mat is not None:
                prim["material"] = mat
            primitives.append(prim)

        ibm = np.array([
            [m.e00, m.e10, m.e20, m.e30, m.e01, m.e11, m.e21, m.e31,
             m.e02, m.e12, m.e22, m.e32, m.e03, m.e13, m.e23, m.e33]
            for m in mesh.m_BindPose
        ], dtype=np.float32).reshape(-1, 4, 4)
        # X 뒤집기를 역바인드 행렬에도 옮긴다: S·M·S (S = diag(-1,1,1,1))
        flip = np.diag([-1.0, 1.0, 1.0, 1.0]).astype(np.float32)
        ibm = np.einsum("ij,njk,kl->nil", flip, ibm, flip)

        meshes.append({"name": mesh.m_Name, "primitives": primitives})
        skins.append({
            "inverseBindMatrices": buf.add(ibm.reshape(-1, 16), "MAT4", FLOAT),
            "joints": [int(j) for j in remap],
            "skeleton": roots[0],
        })
        verts_all.append(verts)

    mesh_nodes = [len(nodes) + i for i in range(len(meshes))]
    for i, mesh in enumerate(meshes):
        nodes.append({"name": mesh["name"], "mesh": i, "skin": i})

    gltf = {
        "asset": {"version": "2.0", "generator": "radiant-platinum bdspGlb"},
        "scene": 0,
        "scenes": [{"nodes": [*roots, *mesh_nodes]}],
        "nodes": nodes,
        "meshes": meshes,
        "skins": skins,
        "materials": materials,
        "textures": textures,
        "images": images,
        "accessors": buf.accessors,
        "bufferViews": buf.views,
        "buffers": [{"byteLength": len(buf.blob)}],
    }

    write_glb(out, gltf, bytes(buf.blob))
    every = np.concatenate(verts_all)
    return {
        "meshes": len(meshes),
        "vertices": int(every.shape[0]),
        "triangles": int(sum(t.shape[0] for _, t in written)),
        "bones": len(bones),
        "materials": len(materials),
        "bytes": out.stat().st_size,
        "outward": float(np.mean([outward_ratio(v, t.reshape(-1)) for v, t in written])),
        "height": float(every[:, 1].max() - every[:, 1].min()),
    }


def outward_ratio(verts: np.ndarray, indices: np.ndarray) -> float:
    """
    삼각형 법선이 바깥을 보는 비율.

    ⚠️ **감기 순서가 맞는지 재는 유일한 방법이다.** 사람 모양은 대체로 닫힌
    껍데기라, 무게중심에서 바깥으로 향하는 면이 대부분이어야 한다. 뒤집혀
    있으면 이 값이 0.5 아래로 떨어진다 — 화면으로 보기 전에 여기서 걸린다.
    """
    tri = indices.reshape(-1, 3)
    a, b, c = verts[tri[:, 0]], verts[tri[:, 1]], verts[tri[:, 2]]
    face = np.cross(b - a, c - a)
    mid = (a + b + c) / 3.0
    center = verts.mean(axis=0)
    return float((np.einsum("ij,ij->i", face, mid - center) > 0).mean())


def verify(path: Path) -> list[str]:
    """
    쓴 파일을 다시 읽어 glTF 규칙을 확인한다.

    ⚠️ **이 확인이 잡을 수 있는 것과 없는 것을 구분해 둔다.** 여기서 잡는 것은
    구조다 — 청크 길이, 접근자가 뷰 밖을 가리키는지, 관절 번호가 스킨 밖인지,
    가중치 합이 1인지. **모델이 제대로 서 있는지는 못 잡는다.** 그건 눈이 할 일이고,
    감기 순서만 `outward_ratio`가 대신 잰다.
    """
    raw = path.read_bytes()
    magic, version, total = struct.unpack_from("<III", raw, 0)
    bad: list[str] = []
    if magic != GLB_MAGIC:
        return ["glb 매직이 아니다"]
    if version != 2:
        bad.append(f"버전이 {version}이다")
    if total != len(raw):
        bad.append(f"헤더 길이 {total} ≠ 실제 {len(raw)}")

    at = 12
    chunks: dict[int, bytes] = {}
    while at + 8 <= len(raw):
        size, kind = struct.unpack_from("<II", raw, at)
        chunks[kind] = raw[at + 8: at + 8 + size]
        at += 8 + size
    if JSON_CHUNK not in chunks or BIN_CHUNK not in chunks:
        return bad + ["청크가 모자란다"]

    g = json.loads(chunks[JSON_CHUNK])
    blob = chunks[BIN_CHUNK]
    if g["buffers"][0]["byteLength"] > len(blob):
        bad.append("버퍼가 선언보다 짧다")

    size_of = {FLOAT: 4, USHORT: 2, UINT: 4}
    parts = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}
    for i, acc in enumerate(g["accessors"]):
        view = g["bufferViews"][acc["bufferView"]]
        want = acc["count"] * parts[acc["type"]] * size_of[acc["componentType"]]
        if want > view["byteLength"]:
            bad.append(f"접근자 {i}가 뷰 밖을 가리킨다 ({want} > {view['byteLength']})")
        if view["byteOffset"] + view["byteLength"] > len(blob):
            bad.append(f"뷰 {acc['bufferView']}가 버퍼 밖이다")

    def read(acc_index: int) -> np.ndarray:
        acc = g["accessors"][acc_index]
        view = g["bufferViews"][acc["bufferView"]]
        dtype = {FLOAT: np.float32, USHORT: np.uint16, UINT: np.uint32}[acc["componentType"]]
        n = acc["count"] * parts[acc["type"]]
        return np.frombuffer(blob, dtype=dtype, count=n, offset=view["byteOffset"])

    node_count = len(g["nodes"])
    for m, mesh in enumerate(g["meshes"]):
        skin = g["skins"][m]
        if any(j >= node_count for j in skin["joints"]):
            bad.append(f"스킨 {m}의 관절이 노드 밖을 가리킨다")
        if len(skin["joints"]) != g["accessors"][skin["inverseBindMatrices"]]["count"]:
            bad.append(f"스킨 {m}: 역바인드 행렬 수가 관절 수와 다르다")
        for prim in mesh["primitives"]:
            verts = g["accessors"][prim["attributes"]["POSITION"]]["count"]
            idx = read(prim["indices"])
            if idx.max(initial=0) >= verts:
                bad.append(f"메시 {m}: 인덱스가 정점 수({verts})를 넘는다")
            if len(idx) % 3:
                bad.append(f"메시 {m}: 삼각형이 셋으로 안 떨어진다")
            if read(prim["attributes"]["JOINTS_0"]).max(initial=0) >= len(skin["joints"]):
                bad.append(f"메시 {m}: 관절 번호가 스킨을 넘는다")
            w = read(prim["attributes"]["WEIGHTS_0"]).reshape(-1, 4).sum(axis=1)
            off = int((np.abs(w - 1.0) > 1e-3).sum())
            if off:
                bad.append(f"메시 {m}: 가중치 합이 1이 아닌 정점 {off}개")
    return bad


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
    # 윈도 콘솔 기본 코드페이지(cp949)로는 한글 경고가 못 나간다
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("bundle", type=Path)
    ap.add_argument("-o", "--out", type=Path, required=True)
    ap.add_argument("-c", "--color-index", type=int, default=None)
    args = ap.parse_args()
    stat = export(args.bundle, args.out, args.color_index)
    print(f"{args.bundle.name} → {args.out}")
    for k, v in stat.items():
        print(f"  {k:<11} {v}")
    if stat["outward"] < 0.6:
        print("  ⚠️ 면이 안쪽을 본다 — 감기 순서가 뒤집혔다")
    problems = verify(args.out)
    for line in problems:
        print(f"  ⚠️ {line}")
    print("  확인       " + ("통과" if not problems else f"{len(problems)}건 어긋남"))
    return 1 if problems else 0


if __name__ == "__main__":
    raise SystemExit(main())

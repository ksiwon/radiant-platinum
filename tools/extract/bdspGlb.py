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

애니메이션도 같이 굽는다. UnityPy가 Mecanim 클립을 안 펴 주므로 원시
타입트리로 내려가 `m_StreamedClip`을 직접 읽는다 — 자세한 것은
`read_streamed`와 `clip_curves` 머리말에 있다.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import struct
import sys
import zlib
from pathlib import Path

import numpy as np
import UnityPy
from UnityPy.helpers import MeshHelper

from bdsp_bake_albedo import bake
from bdspRetarget import (
    build_rig, leaf_of, pair_by_name, retarget, round_trip_error, top_of,
)

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


def euler_to_quat(deg: list[float]) -> tuple[float, float, float, float]:
    """유니티 오일러 커브(도) → 쿼터니언.

    유니티는 **ZXY** 차례로 돌린다 (`Quaternion.Euler`가 그렇다) — 차례를 바꾸면
    같은 각도가 다른 자세가 된다
    """
    hx, hy, hz = (math.radians(a) * 0.5 for a in deg)
    sx, cx = math.sin(hx), math.cos(hx)
    sy, cy = math.sin(hy), math.cos(hy)
    sz, cz = math.sin(hz), math.cos(hz)
    return (
        sx * cy * cz + cx * sy * sz,
        cx * sy * cz - sx * cy * sz,
        cx * cy * sz - sx * sy * cz,
        cx * cy * cz + sx * sy * sz,
    )


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


# ── 애니메이션 ─────────────────────────────────────────────────────────────
# UnityPy가 Mecanim 클립을 안 펴 준다(`m_Clip`이 빈 객체로 나온다). 원시
# 타입트리로 내려가면 스트림·조밀·상수 세 벌이 그대로 들어 있어서 직접 읽는다.
#
# 커브 번호는 **한 줄로 이어진다**: 스트림 → 조밀 → 상수 순서다. 바인딩 목록이
# 그 줄을 순서대로 나눠 갖는데, 자리 옮김이 3칸·회전이 4칸·크기가 3칸이다.
#
# 바인딩이 가리키는 뼈는 이름이 아니라 **경로의 CRC32**다. 계층을 훑어 경로를
# 만들고 같은 방식으로 해시하면 짝이 맞는다 — 실측으로 171 중 171이 붙었다.

TRANSLATION, ROTATION, SCALE, EULER = 1, 2, 3, 4
# ⚠️ **오일러(4)를 빼먹으면 그 클립이 통째로 어긋난다.** 커브 번호는 바인딩을
# 훑으며 폭만큼 더해 가는 자리 번호라, 폭 3짜리를 1로 세면 **그 뒤의 모든
# 채널이 두 칸씩 밀린다.** 포켓몬 대기 동작에서 바인딩 97개 중 여섯이 오일러고,
# 그래서 뼈가 100m 밖으로 날아갔다 — 화면에는 아무것도 안 보였다
CURVE_WIDTH = {TRANSLATION: 3, ROTATION: 4, SCALE: 3, EULER: 3}
TRANSFORM_CLASS = 4


def as_float(word: int) -> float:
    return struct.unpack("<f", struct.pack("<I", word & 0xFFFFFFFF))[0]


def read_streamed(words: list[int]) -> dict[int, list[tuple[float, float]]]:
    """
    스트림 클립을 커브별 (시각, 값) 목록으로 편다.

    한 프레임이 `시각 · 키 개수 · (커브번호 + 계수 4)×n`이다. 계수 넷 중 **마지막이
    값**이고 셋째가 나가는 기울기다 — 우리는 값만 쓰고 glTF 쪽에서 선형으로 잇는다.

    ⚠️ **앞뒤 프레임은 버린다.** Unity가 경계 처리를 위해 앞에 둘, 뒤에 하나를
    더 넣어 두는데 시각이 음수이거나 클립 길이를 넘는다. 그대로 쓰면 애니메이션이
    시작 전부터 튄다
    """
    frames: list[tuple[float, list[tuple[int, float]]]] = []
    i, n = 0, len(words)
    while i + 2 <= n:
        time = as_float(words[i]); i += 1
        count = words[i]; i += 1
        if count < 0 or i + count * 5 > n:
            break
        keys = []
        for _ in range(count):
            index = words[i]; i += 1
            keys.append((index, as_float(words[i + 3])))
            i += 4
        frames.append((time, keys))

    out: dict[int, list[tuple[float, float]]] = {}
    for time, keys in frames[2:-1] if len(frames) > 3 else frames:
        for index, value in keys:
            out.setdefault(index, []).append((time, value))
    return out


def clip_curves(clip: dict) -> tuple[dict[int, list[tuple[float, float]]], float]:
    """클립 하나의 모든 커브. 상수 커브는 시각 0에 값 하나만 둔다."""
    muscle = clip["m_MuscleClip"]
    data = muscle["m_Clip"]["data"]
    streamed = read_streamed(data["m_StreamedClip"]["data"])
    dense = data["m_DenseClip"]
    constant = data["m_ConstantClip"]["data"]

    curves = dict(streamed)
    base = int(data["m_StreamedClip"]["curveCount"])
    frames, wide = int(dense["m_FrameCount"]), int(dense["m_CurveCount"])
    rate = float(dense["m_SampleRate"]) or 60.0
    begin = float(dense["m_BeginTime"])
    samples = dense["m_SampleArray"]
    for c in range(wide):
        curves[base + c] = [
            (begin + f / rate, float(samples[f * wide + c])) for f in range(frames)
        ]
    for c, value in enumerate(constant):
        curves[base + wide + c] = [(0.0, float(value))]
    return curves, float(muscle["m_StopTime"])


def transform_paths(env) -> dict[int, str]:
    """Transform PathID → 애니메이터 루트 기준 경로. CRC32의 재료다."""
    tr = {o.path_id: o.read() for o in env.objects if o.type.name == "Transform"}
    parent: dict[int, int] = {}
    for pid, t in tr.items():
        for c in t.m_Children:
            parent[c.m_PathID] = pid
    out = {}
    for pid in tr:
        parts, at = [], pid
        while at in tr:
            parts.append(bone_name(tr[at]))
            at = parent.get(at)
            if at is None:
                break
        # 맨 위(애니메이터가 붙은 루트)는 경로에 안 들어간다
        out[pid] = "/".join(reversed(parts[:-1])) if len(parts) > 1 else ""
    return out


def bindings_by_curve(clip: dict) -> list[tuple[int, int, int]]:
    """(경로해시, 속성, 첫 커브 번호). Transform이 아닌 바인딩은 뺀다."""
    at = 0
    out = []
    for b in clip["m_ClipBindingConstant"]["genericBindings"]:
        attr = int(b["attribute"])
        if int(b.get("typeID") or 0) == TRANSFORM_CLASS and attr in CURVE_WIDTH:
            out.append((int(b["path"]), attr, at))
            at += CURVE_WIDTH[attr]
        else:
            at += 1
    return out


def sample(points: list[tuple[float, float]], t: float) -> float:
    """커브 하나를 시각 `t`에서. 사이는 선형, 밖은 끝값으로 잡는다."""
    if not points:
        return 0.0
    if t <= points[0][0]:
        return points[0][1]
    if t >= points[-1][0]:
        return points[-1][1]
    lo, hi = 0, len(points) - 1
    while hi - lo > 1:
        mid = (lo + hi) // 2
        if points[mid][0] <= t:
            lo = mid
        else:
            hi = mid
    (t0, v0), (t1, v1) = points[lo], points[hi]
    k = 0.0 if t1 == t0 else (t - t0) / (t1 - t0)
    return v0 + (v1 - v0) * k


def build_animations(env, buf: "Buffer", node_of_hash: dict[int, int],
                     keep: "re.Pattern | None" = None) -> tuple[list, dict]:
    """클립 전부를 glTF 애니메이션으로. 통계도 함께 돌려준다.

    `keep`을 주면 이름이 맞는 클립만 싣는다. **포켓몬 때문에 있다** — 종마다
    클립 열넷이 오는데 그중 배틀에서 쓰는 것은 `ba*`뿐이고, 나머지(아미티광장에서
    좋아하기 셋 · 싫어하기 · 포핀 먹기 · 필드 걷기)가 애니 데이터의 36%다
    """
    animations, stat = [], {"clips": 0, "channels": 0, "unresolved": 0, "keys": 0, "skipped": 0}
    for obj in env.objects:
        if obj.type.name != "AnimationClip":
            continue
        clip = obj.read_typetree()
        if keep is not None and not keep.search(clip["m_Name"]):
            stat["skipped"] += 1
            continue
        curves, stop = clip_curves(clip)
        samplers, channels = [], []
        for path_hash, attr, first in bindings_by_curve(clip):
            node = node_of_hash.get(path_hash)
            if node is None:
                stat["unresolved"] += 1
                continue
            wide = CURVE_WIDTH[attr]
            parts = [curves.get(first + c, []) for c in range(wide)]
            times = sorted({t for p in parts for t, _ in p})
            if not times:
                continue
            # 상수뿐인 채널은 키 하나면 된다 — 붙박이인데 프레임을 다 적을 이유가 없다
            if len(times) == 1:
                times = [0.0]
            values = [[sample(p, t) for p in parts] for t in times]
            if attr == TRANSLATION:
                values = [[-v[0], v[1], v[2]] for v in values]
            elif attr == ROTATION:
                values = [quat_flip_x((v[0], v[1], v[2], v[3])) for v in values]
            elif attr == EULER:
                values = [quat_flip_x(euler_to_quat(v)) for v in values]
                wide = 4
            a_time = buf.add(np.array(times, dtype=np.float32).reshape(-1, 1), "SCALAR", FLOAT)
            a_val = buf.add(
                np.array(values, dtype=np.float32),
                "VEC3" if wide == 3 else "VEC4", FLOAT,
            )
            samplers.append({"input": a_time, "output": a_val, "interpolation": "LINEAR"})
            channels.append({
                "sampler": len(samplers) - 1,
                "target": {"node": node, "path": {
                    TRANSLATION: "translation", ROTATION: "rotation", SCALE: "scale",
                    EULER: "rotation",
                }[attr]},
            })
            stat["keys"] += len(times)
        if not channels:
            continue
        animations.append({
            "name": clip["m_Name"], "samplers": samplers, "channels": channels,
        })
        stat["clips"] += 1
        stat["channels"] += len(channels)
        stat["stop"] = round(stop, 3)
    return animations, stat


def borrowed_clips(
    donor: Path, env, buf: "Buffer", node_of_hash: dict[int, int], only: set[str],
) -> tuple[list, dict]:
    """
    다른 몸의 클립을 이 몸으로 옮겨 온다 (`bdspRetarget` 머리말).

    등신 몸에는 필드 동작이 없다 — 원작에서 이 몸은 배틀에만 선다. 치비 쪽에
    있는 낚시·폭포·물주기를 뼈 이름으로 짝지어 옮긴다. 이름이 같은 뼈만
    옮기고 나머지는 타깃의 쉬는 자세로 둔다: **지어내지 않는다.**

    ⚠️ **치비 번들을 통째로 안 연다.** 메시는 다른 번들에 나가 있지만
    (PLAN §16.9) 여기서 쓰는 것은 Transform 계층과 AnimationClip뿐이고 그
    둘은 번들 하나에 다 들어 있다 — 실측으로 `fc0001_00` 하나에서 Transform
    276개와 클립 56개가 나온다.
    """
    donor_env = UnityPy.load(str(donor))
    source, source_hash = build_rig(donor_env, bone_name, transform_paths)
    target, target_hash = build_rig(env, bone_name, transform_paths)
    # 타깃은 경로 → glTF 노드 번호가 필요하다
    node_of_path = {p: node_of_hash[h] for h, p in target_hash.items() if h in node_of_hash}
    node_of_name: dict[str, int] = {}
    for path, node in node_of_path.items():
        node_of_name.setdefault(leaf_of(path), node)

    animations, stat = [], {
        "borrowed": 0, "borrowedChannels": 0, "borrowedBones": 0,
        "roundTrip": 0.0, "ambiguous": 0,
    }
    for obj in donor_env.objects:
        if obj.type.name != "AnimationClip":
            continue
        clip = obj.read_typetree()
        if only and clip["m_Name"] not in only:
            continue
        curves, stop = clip_curves(clip)
        rots: dict[str, list] = {}
        branches: set[str] = set()
        for path_hash, attr, first in bindings_by_curve(clip):
            path = source_hash.get(path_hash)
            if path is None:
                continue
            branches.add(top_of(path))
            if attr != ROTATION:
                continue
            rots[path] = [curves.get(first + c, []) for c in range(4)]
        times = sorted({t for parts in rots.values() for p in parts for t, _ in p})
        if len(times) < 2:
            continue
        pairs, ambiguous = pair_by_name(source, target, branches)
        stat["ambiguous"] += ambiguous
        if not pairs:
            continue
        frames = [
            {n: np.array([sample(p, t) for p in parts]) for n, parts in rots.items()}
            for t in times
        ]
        moved, shared = retarget(source, target, pairs, frames)
        # 첫 네 프레임이면 넉넉하다 — 수식이 틀리면 한 프레임에서 바로 벌어진다
        stat["roundTrip"] = max(
            stat["roundTrip"], round_trip_error(source, target, pairs, frames[:4]),
        )

        samplers, channels = [], []
        a_time = buf.add(np.array(times, dtype=np.float32).reshape(-1, 1), "SCALAR", FLOAT)
        for path in shared:
            node = node_of_name.get(leaf_of(path))
            if node is None:
                continue
            values = [quat_flip_x(tuple(f[path])) for f in moved]
            a_val = buf.add(np.array(values, dtype=np.float32), "VEC4", FLOAT)
            samplers.append({"input": a_time, "output": a_val, "interpolation": "LINEAR"})
            channels.append({
                "sampler": len(samplers) - 1,
                "target": {"node": node, "path": "rotation"},
            })
        if not channels:
            continue
        animations.append({
            "name": clip["m_Name"], "samplers": samplers, "channels": channels,
        })
        stat["borrowed"] += 1
        stat["borrowedChannels"] += len(channels)
        stat["borrowedBones"] = max(stat["borrowedBones"], len(channels))
    return animations, stat


def export(bundle, out: Path, color_index: int | None = None,
           clips_from: Path | None = None, only: set[str] | None = None,
           max_texture: int | None = None, keep_clips: bool = True,
           # ⚠️ **둘 다 본다.** 인물 셰이더는 `_MainTex`에 음영을 싣고 포켓몬
           # 셰이더는 `_Col0Tex`에 색을 싣는데, **인물 번들에 포켓몬이 들어 있는
           # 자리가 있다** — 대호평 아가씨(`tr1021_00`)가 우리는 (pm0438)를
           # 안고 서 있다. `_MainTex`만 보면 그 열두 조각에 재질이 안 붙어
           # 우리가 하얀 덩어리가 된다
           main_props: tuple[str, ...] = ("_MainTex", "_Col0Tex"),
           clip_filter: "re.Pattern | None" = None) -> dict:
    # 번들이 여럿일 수 있다. **포켓몬이 그렇다** — 배틀 프리팹(재질·뼈대·동작)과
    # `pokemons/common`의 메시·텍스처 둘을 한 환경에 같이 올려야 풀린다
    paths = [bundle] if isinstance(bundle, (str, Path)) else list(bundle)
    first = Path(paths[0])
    env = UnityPy.load(*[str(p) for p in paths])
    smrs = [o.read() for o in env.objects if o.type.name == "SkinnedMeshRenderer"]
    if not smrs:
        raise SystemExit(f"{first.name}: SkinnedMeshRenderer가 없다")

    # 껍데기가 하나가 아니다. 트레이너(`tr####`)는 `baseSkin` 하나뿐이지만
    # 주인공(`pc####`)은 여섯이다 — 몸·머리 두 벌·신발 두 벌·손목시계.
    # 처음에 첫 번째만 꺼냈더니 정점 178개짜리 **손목시계 하나**가 glb로
    # 나왔다. 재어 보고 알았다: 키가 0.056m였다
    buf = Buffer()
    ARRAY, ELEMENT = 34962, 34963

    # ⚠️ **뼈대를 껍데기의 본 목록에서 만들면 안 된다.** 애니메이션은 스킨에
    # 안 들어간 Transform(`Origin` 같은 중간 마디)도 움직인다 — 그것들이 노드에
    # 없으면 채널이 갈 곳을 잃는다. 그래서 번들의 Transform 전부로 세운다
    bones = [o.read() for o in env.objects if o.type.name == "Transform"]
    nodes, index = bone_tree(bones)
    child = {c for n in nodes for c in n.get("children", [])}
    roots = [i for i in range(len(nodes)) if i not in child]
    node_of_hash = {
        zlib.crc32(p.encode()) & 0xFFFFFFFF: index[pid]
        for pid, p in transform_paths(env).items() if pid in index
    }

    # 알베도는 번들 통째로 한 번만 굽는다
    albedo = out.parent / f".{out.stem}_albedo"
    spec = bake(paths, albedo, color_index, max_texture, main_props)
    images, textures, materials, by_name = [], [], [], {}
    samplers: list[dict] = []
    for png in sorted(albedo.glob("*_albedo.png")):
        name = png.name[: -len("_albedo.png")]
        view = buf._view(png.read_bytes())
        images.append({"bufferView": view, "mimeType": "image/png", "name": name})
        look = spec.get(name, {})
        wrap_s, wrap_t = look.get("wrap", (10497, 10497))
        want = {"wrapS": wrap_s, "wrapT": wrap_t}
        if want not in samplers:
            samplers.append(want)
        textures.append({"source": len(images) - 1, "sampler": samplers.index(want)})
        # ⚠️ **여기를 `MASK` 하나로 못 박아 두던 자리다.** 그러면 알파가 낮은
        # 자리가 전부 뚫린다 — 눈이 통째로 사라졌다. 재질이 스스로 적어 둔
        # 블렌드 상태를 그대로 옮긴다 (`bdsp_bake_albedo`의 `GLTF_ALPHA`)
        mode = look.get("alpha", "OPAQUE")
        materials.append({
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": len(textures) - 1},
                "metallicFactor": 0.0,
                "roughnessFactor": 0.85,
            },
            "alphaMode": mode,
            **({"alphaCutoff": 0.5} if mode == "MASK" else {}),
            "doubleSided": bool(look.get("double", False)),
        })
        by_name[name] = len(materials) - 1
        png.unlink()
    albedo.rmdir()

    meshes, skins, verts_all, written = [], [], [], []
    seen_mesh: set[int] = set()
    dropped_smr = 0
    stat = {"noMaterial": []}
    for smr in smrs:
        # ⚠️ **껍데기가 겹쳐 들어오는 종이 있다.** 독침붕(pm0015)은 SMR이 다섯인데
        # 날개 두 벌이 **같은 메시를 두 번** 가리키고, 그중 한 벌은 재질이 다른
        # 번들에 있어 못 읽는다. 같은 메시를 두 번 쓰면 정점이 두 배가 되고,
        # 못 읽는 쪽에서 터지면 그 종이 통째로 빠진다 — 둘 다 여기서 막는다
        try:
            pid = smr.m_Mesh.m_PathID
        except AttributeError:
            pid = 0
        if pid and pid in seen_mesh:
            dropped_smr += 1
            continue
        try:
            smr.m_Materials[0].read()
        except Exception:
            dropped_smr += 1
            continue
        if pid:
            seen_mesh.add(pid)
        try:
            mesh = smr.m_Mesh.read()
        except FileNotFoundError as e:
            # ⚠️ **치비 번들(`field/fc####`)은 자급자족이 아니다.** 메시가 다른
            # 번들에 있어서 그 폴더를 통째로 열어야 풀린다(644MB). 등신 쪽
            # (`battle/tr####`)은 번들 하나에 다 들어 있다 — 우리가 쓰는 것은
            # 그쪽이라 지금은 여기서 끊고 무엇이 없는지만 말해 준다
            raise SystemExit(
                f"{first.name}: 메시가 다른 번들에 있다 ({e}). "
                "치비 번들은 폴더를 통째로 열어야 한다"
            ) from e
        handler = MeshHelper.MeshHandler(mesh)
        handler.process()

        verts = flip_x(np.array(handler.m_Vertices, dtype=np.float32).reshape(-1, 3))
        normals = flip_x(np.array(handler.m_Normals, dtype=np.float32).reshape(-1, 3))
        uv_raw = np.array(handler.m_UV0, dtype=np.float32).reshape(-1, 2)
        # ⚠️ **스킨 정보가 없는 껍데기가 섞여 있다**(tr0030_00에서 나왔다).
        # 뼈 하나에 통째로 매달린 딱딱한 메시라 가중치 배열이 아예 없다.
        # 그런 것은 0번 뼈에 100%로 묶는다 — 그 뼈를 따라 통째로 움직인다
        rigid = handler.m_BoneWeights is None or handler.m_BoneIndices is None
        count = len(handler.m_Vertices)
        joints = np.zeros((count, 4), dtype=np.uint16)
        weights = np.zeros((count, 4), dtype=np.float32)
        if rigid:
            weights[:, 0] = 1.0
        else:
            # ⚠️ **정점 하나에 뼈가 넷이라고 두면 안 된다.** 메시마다 다르다 —
            # 주인공의 손목시계는 **둘**이고 나머지는 넷이다. `reshape(-1, 4)`로
            # 접으면 정점 둘이 한 줄로 겹쳐서 JOINTS_0이 정점 수의 절반(178→89)이
            # 되고, three가 없는 번호의 뼈를 집어 **매 프레임 터진다**
            # (`Box3.setFromObject` → `applyBoneTransform`). 그러면 그 사람만
            # 안 서는 것이 아니라 NPC 모델 회전 전체가 프레임마다 끊긴다.
            # 이걸 "가중치 합이 1이 아닌 정점 89개"로 잘못 읽고 지나쳤던 자리다
            bi = np.asarray(handler.m_BoneIndices)
            bw = np.asarray(handler.m_BoneWeights, dtype=np.float32)
            if bi.ndim == 1:
                bi = bi.reshape(count, -1)
                bw = bw.reshape(count, -1)
            wide = min(bi.shape[1], 4)
            joints[:, :wide] = bi[:, :wide].astype(np.uint16)
            weights[:, :wide] = bw[:, :wide]
        # glTF는 가중치 합이 1이어야 한다. 안 맞으면 그 정점만 쪼그라든다
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
        a_joint = buf.add(joints, "VEC4", USHORT, ARRAY)
        a_weight = buf.add(weights, "VEC4", FLOAT, ARRAY)

        # ⚠️ **UV는 재질이 적어 둔 배율·오프셋을 먹여야 한다.** 포켓몬 셰이더는
        # `_Col0Tex_ST`에 배율 (2, 1)을 적어 두고, 그림은 U를 **거울**로 반복하게
        # 해 둔다 — 몸의 왼쪽이 u ∈ [0, 0.5], 오른쪽이 그 거울인 1 − u다
        # (실측: 서브메시마다 왼쪽 최대 + 오른쪽 최소 = 1.000). 배율을 안 먹이면
        # 좌우가 그림의 서로 다른 자리를 읽어 **몸이 한가운데를 세로로 갈라
        # 조각보가 된다.** 인물·무대는 배율 (1, 1)에 반복이라 아무 일도 안 난다.
        uv_of: dict[tuple, int] = {}

        def uv_accessor(st: tuple) -> int:
            got = uv_of.get(st)
            if got is None:
                sx, sy, ox, oy = st
                # Unity는 UV 원점이 왼쪽 아래, glTF는 왼쪽 위다
                got = buf.add(np.stack([
                    uv_raw[:, 0] * sx + ox, 1.0 - (uv_raw[:, 1] * sy + oy),
                ], axis=1).astype(np.float32), "VEC2", FLOAT, ARRAY)
                uv_of[st] = got
            return got

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
            mat_name = mats[i].m_Name if i < len(mats) else ""
            st = tuple(spec.get(mat_name, {}).get("uv", (1.0, 1.0, 0.0, 0.0)))
            prim = {
                "attributes": {
                    "POSITION": a_pos, "NORMAL": a_nrm, "TEXCOORD_0": uv_accessor(st),
                    "JOINTS_0": a_joint, "WEIGHTS_0": a_weight,
                },
                "indices": buf.add(tri.reshape(-1).astype(np.uint32), "SCALAR", UINT, ELEMENT),
                "mode": 4,
            }
            mat = by_name.get(mat_name)
            # ⚠️ **재질이 없으면 그리지 않는다.** three는 재질 없는 조각을
            # **기본 흰색**으로 그린다 — 리자몽 꼬리·또가스 연기·로토무 오라에
            # 흰 덩어리가 붙어 있었다(54종 233조각). 색이 있는 것은
            # `effect_albedo`가 구워 주고, 여기 남는 것은 스텐실로 깎아 내는
            # `*Mask` 조각뿐이라 안 그리는 것이 맞다
            if mat is None:
                stat["noMaterial"].append(mat_name or mesh.m_Name)
                continue
            prim["material"] = mat
            primitives.append(prim)

        # 조각이 하나도 안 남았다 — 스텐실 마스크만 든 껍데기다. glTF는 조각
        # 없는 메시를 안 받으므로 껍데기째 뺀다 (`verify`가 잡아 준다)
        if not primitives:
            dropped_smr += 1
            continue

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

    # ⚠️ **오버월드 NPC는 클립을 안 싣는다.** 걷기는 `actor/locomotion`이 뼈를
    # 직접 돌려서 만드는 것이라(주인공도 그렇다) 구운 클립을 쓸 자리가 없다.
    # 벌레잡이(tr1006_00)에서 클립 아홉 개가 glb의 절반이다 — 2.58MB → 1.20MB
    animations, anim_stat = (
        build_animations(env, buf, node_of_hash, clip_filter) if keep_clips
        else ([], {"clips": 0, "channels": 0, "unresolved": 0, "keys": 0})
    )
    if clips_from is not None:
        extra, borrow_stat = borrowed_clips(clips_from, env, buf, node_of_hash, only or set())
        animations += extra
        anim_stat.update(borrow_stat)

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
    # 빈 배열은 glTF가 안 받는다 — 그림이 하나도 없는 번들이 있다
    if samplers:
        gltf["samplers"] = samplers
    if animations:
        gltf["animations"] = animations

    write_glb(out, gltf, bytes(buf.blob))
    every = np.concatenate(verts_all)
    return {
        "meshes": len(meshes),
        "dropped": dropped_smr,
        "noMaterial": stat["noMaterial"],
        "vertices": int(every.shape[0]),
        "triangles": int(sum(t.shape[0] for _, t in written)),
        "bones": len(bones),
        "materials": len(materials),
        "bytes": out.stat().st_size,
        "outward": float(np.mean([outward_ratio(v, t.reshape(-1)) for v, t in written])),
        "height": float(every[:, 1].max() - every[:, 1].min()),
        **anim_stat,
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
            # ⚠️ 속성 길이가 서로 달라도 파일은 열린다. 짧은 쪽을 넘어가는
            # 정점에서 three가 없는 뼈를 집어 매 프레임 터진다 — 주인공
            # 손목시계가 그렇게 178 대 89로 어긋나 있었다
            for name, acc_index in prim["attributes"].items():
                n = g["accessors"][acc_index]["count"]
                if n != verts:
                    bad.append(f"메시 {m}: {name}이 {n}개인데 정점은 {verts}개다")
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

    for a, anim in enumerate(g.get("animations", [])):
        for ch in anim["channels"]:
            if ch["target"]["node"] >= node_count:
                bad.append(f"클립 {a}: 채널이 노드 밖을 가리킨다")
            sampler = anim["samplers"][ch["sampler"]]
            n_in = g["accessors"][sampler["input"]]["count"]
            n_out = g["accessors"][sampler["output"]]["count"]
            if n_in != n_out:
                bad.append(f"클립 {a}: 키 {n_in}개에 값 {n_out}개")
            times = read(sampler["input"])
            if len(times) > 1 and bool((np.diff(times) <= 0).any()):
                bad.append(f"클립 {a}: 시각이 오름차순이 아니다")
            if ch["target"]["path"] == "rotation":
                q = read(sampler["output"]).reshape(-1, 4)
                if float(np.abs(np.linalg.norm(q, axis=1) - 1).max()) > 1e-3:
                    bad.append(f"클립 {a}: 회전이 단위 사원수가 아니다")
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
    ap.add_argument("--clips-from", type=Path, default=None,
                    help="이 번들의 클립을 뼈 이름으로 옮겨 온다 (치비 → 등신)")
    ap.add_argument("--no-clips", action="store_true",
                    help="애니메이션을 안 싣는다. 걷기는 locomotion이 만든다")
    ap.add_argument("--max-texture", type=int, default=None,
                    help="텍스처 긴 변의 상한. 오버월드 NPC를 줄이는 데 쓴다")
    ap.add_argument("--only", default="",
                    help="옮겨 올 클립 이름들, 쉼표로 나눈다. 비우면 전부")
    ap.add_argument("--clip-filter", default="",
                    help="이 정규식에 맞는 클립만 싣는다. 비우면 전부. "
                         "배틀 트레이너는 '^(advent_b|order_b|lose01_b)$'")
    args = ap.parse_args()
    stat = export(
        args.bundle, args.out, args.color_index, args.clips_from,
        {n for n in args.only.split(",") if n}, args.max_texture, not args.no_clips,
        clip_filter=re.compile(args.clip_filter) if args.clip_filter else None,
    )
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

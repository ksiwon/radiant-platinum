"""BDSP 배틀 무대 번들 → glb (PLAN §4.3, DATA.md §7.4).

    pnpm extract:arenas                      표에 실린 무대를 전부 굽는다
    py -3.13 tools/extract/bdspArena.py <번들> -o <나갈 곳>.glb    한 벌만

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
import math
import re
import struct
import sys
from pathlib import Path

import numpy as np
import UnityPy
from UnityPy.helpers import MeshHelper

from bdsp_bake_albedo import bake, linear_to_srgb, plant_kind, prop_pairs, srgb_to_linear_scalar

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.raw.sources import require_dir

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


#: 더해서 그리는 재질 — `_SrcBlend 5 · _DstBlend 1` (SrcAlpha, One)
ADD_SRC, ADD_DST = 5.0, 1.0


def tint_of(floats: dict, colors: dict, layer: bool, see: bool) -> list[float] | None:
    """그림 있는 재질에 곱할 색 — 브라우저 변환기 `arena.ts`의 `tintOf`(더하지 않는 갈래)와 같은 식이다.

    층 그림을 밑그림으로 쓴 재질은 `_LayerColor`를 곱한다. **반투명 겹그림**(뿌리 그림자 `RootShadow_01` · 길 가장자리
    `Grad_01` …)은 `_Color` × `_ColorIntensity`와 `_Color`의 알파를 곱한다 — `RootShadow_01`은 그림이 순백(RGB 255 · 알파만
    모양)이고 색이 (0.113, 0.102, 0.102) × 0.5 · 알파 0.325에 있어서, 안 곱하면 가구 밑이 **흰 후광**으로 뜬다.
    세기가 0인 겹그림은 바탕이 0이라 안 보인다. 색은 감마로 적혀 있다 — 선형으로 내려서 싣는다
    """
    def rgb(key: str):
        c = colors.get(key)
        if not c:
            return None
        return [srgb_to_linear_scalar(c.get(k, 1.0)) for k in ("r", "g", "b")] + [c.get("a", 1.0)]

    if layer:
        c = rgb("_LayerColor")
        return None if c is None else [c[0], c[1], c[2], 1]
    if not see:
        return None
    c = rgb("_Color")
    if c is None:
        return None
    k = floats.get("_ColorIntensity", 1.0)

    def clamp(x: float) -> float:
        return min(1.0, max(0.0, x))

    return [clamp(c[0] * k), clamp(c[1] * k), clamp(c[2] * k), 0 if k == 0 else clamp(c[3])]


def tex_pid(tex: dict, key: str) -> int:
    """재질 그림 칸(`m_TexEnvs`의 `_MainTex` · `_LayerTex` · `_BlendTex` …)에 물린 그림의 PathID. 칸이 없거나 비면 0. 브라우저 변환기 `arena.ts`의 `texturePid`와 같다"""
    v = tex.get(key)
    return v.get("m_Texture", {}).get("m_PathID", 0) if isinstance(v, dict) else 0


def cascade_mix(env, d: dict, colors: dict, floats: dict, max_size: int | None) -> bytes | None:
    """**마스크로 두 색을 섞는 그림 없는 재질** — 바탕(`_MainTex`)도 층(`_LayerTex`)도 없이 `_BlendTex`만 물렸다.

    충호 방(g038) 바닥 `M_B_038_Floor_24`가 그렇다 — `_CASCADE_BLENDUV0`라 첫 UV로 `_BlendTex`를 읽어 R만큼
    `_Color` × `_ColorIntensity`(0.75 × 1.7 — 가운데 빛)에서 `_LayerColor` × `_LayerColorIntensity`(남청)로 넘어간다.
    `_Color`만 실으면 25 m 판이 통째로 하얗게 탄다. 섞은 색을 그림 한 장으로 굽는다 — 브라우저 변환기 `arena.ts`의 `cascadeMix`와 같다
    """
    # 둘째 UV로 읽는 것(`_BlendUVIndex` 1 — g009 · g010 바다)과 거울 반사 물(`_ENVIRONMENTMAPENABLE_MIRRORMAP` — g011)은
    # 둘째 UV를 안 싣고 반사도 안 옮기니 손대지 않는다
    words = str(d.get("m_ShaderKeywords") or "")
    if "_CASCADE_BLENDUV0" not in words or "MIRRORMAP" in words or floats.get("_BlendUVIndex", 0.0) != 0:
        return None
    tex = dict(prop_pairs(d.get("m_SavedProperties", {}).get("m_TexEnvs", [])))
    if tex_pid(tex, "_BlendTex") == 0 or tex_pid(tex, "_MainTex") != 0 or tex_pid(tex, "_LayerTex") != 0:
        return None
    mask = next((o for o in env.objects if o.path_id == tex_pid(tex, "_BlendTex")), None)
    if mask is None:
        return None
    from io import BytesIO
    from PIL import Image
    img = mask.read().image.convert("RGBA")
    if max_size is not None and max(img.size) > max_size:
        k = max_size / max(img.size)
        # `bdsp_bake_albedo.bake`의 줄이기와 같다 — RGBA `LANCZOS` (`arena.ts`는 `resizePremultiplied`)
        img = img.resize((max(1, round(img.size[0] * k)), max(1, round(img.size[1] * k))), Image.LANCZOS)
    r = np.asarray(img, dtype=np.float32)[..., 0:1] / 255.0

    def lin(key: str, gain: str) -> np.ndarray:
        c = colors.get(key) or {}
        k = floats.get(gain, 1.0)
        return np.array([srgb_to_linear_scalar(c.get(x, 1.0)) * k for x in ("r", "g", "b")], dtype=np.float32)

    mix = np.clip(lin("_Color", "_ColorIntensity") * (1 - r) + lin("_LayerColor", "_LayerColorIntensity") * r, 0, 1)
    rgb = np.round(linear_to_srgb(mix) * 255).astype(np.uint8)
    # RGBA로 싣는다 — 다른 알베도 그림(`bake`)과 같은 꼴, `arena.ts`도 알파 255를 채워 싣는다
    rgba = np.concatenate([rgb, np.full(rgb.shape[:2] + (1,), 255, dtype=np.uint8)], axis=2)
    out = BytesIO()
    Image.fromarray(rgba, "RGBA").save(out, "PNG")
    return out.getvalue()


def plant_colors(colors: dict) -> tuple[np.ndarray, np.ndarray]:
    """나무열매 재질의 `_Color` · `_LayerColor` — 선형 float32. 색은 감마로 적혀 있다 (`tint_of`와 같은 자리). 브라우저 변환기 `arena.ts`의 `plantColors`와 같다"""
    def rgb(key: str) -> np.ndarray:
        c = colors.get(key) or {}
        return np.array([srgb_to_linear_scalar(c.get(k, 1.0)) for k in ("r", "g", "b")], dtype=np.float32)

    return rgb("_Color"), rgb("_LayerColor")


def flipbook_cell(columns: float, rows: float, start: float) -> dict | None:
    """플립북 그림의 **첫 칸** — `KHR_texture_transform`의 배율 · 오프셋 (glTF UV, 위가 0). `arena.ts`의 `flipbookCell`과 같다.

    TV 화면 `M_C_001_Video_03`은 한 장에 영상 칸 8×8을 담고 셰이더가 `_PatternH` · `_PatternV` · `_StartFrameIndex`(45)로 한 칸만
    잘라 보인다. ⚠️ 칸 번호는 **아래 줄부터** 센다 — 그림에 찬 칸은 위에서부터 42칸이라 위에서 세면 45번은 빈 검은 칸이다
    """
    if not (columns >= 1 and rows >= 1) or columns * rows <= 1:
        return None
    columns, rows = int(columns), int(rows)
    cell = int(start) % (columns * rows)
    col = cell % columns
    from_bottom = cell // columns
    return {"offset": [col / columns, (rows - 1 - from_bottom) / rows], "scale": [1 / columns, 1 / rows]}


def motion_extras(floats: dict, colors: dict, layered: bool) -> dict | None:
    """재질이 적어 둔 흐름 · 흔들림 값 — 브라우저 변환기 `motion.ts`의 `motionExtras`와 **같은 JSON**이다 (키 순서까지).

    `_TexVelocity`의 채널 대응(xy = `_MainTex` · zw = `_LayerTex`)은 추측이다 — 셰이더가 Switch 바이너리라 못 읽는다
    """
    def color(key: str):
        c = colors.get(key)
        return [c.get("r", 0.0), c.get("g", 0.0), c.get("b", 0.0), c.get("a", 0.0)] if c else None

    def anything(v) -> bool:
        return any(x != 0 for x in v)

    out: dict = {}
    vel = color("_TexVelocity")
    if vel:
        main, layer = [vel[0], vel[1]], [vel[2], vel[3]]
        pick = (layer if anything(layer) else main) if layered else (main if anything(main) else layer)
        if anything(pick):
            out["texVel"] = pick
    speed = floats.get("_ScrollSpeed")
    if isinstance(speed, (int, float)) and speed != 0:
        out["scroll"] = [0, speed]
    h, v = floats.get("_PatternH", 1.0), floats.get("_PatternV", 1.0)
    every = floats.get("_SwitchingTime")
    if isinstance(every, (int, float)) and every > 0 and floats.get("_AutoSwitch", 0.0) > 0 and h >= 1 and v >= 1 and h * v > 1:
        out["frames"] = {"h": int(h), "v": int(v), "start": int(floats.get("_StartFrameIndex", 0.0)), "every": every}
    if floats.get("_SwingEnable", 0.0) > 0:
        scale = color("_SwingScale") or [0.0, 0.0, 0.0, 0.0]
        wind = color("_WindDirection") or [1.0, 0.0, 0.0, 0.0]
        out["swing"] = {
            "power": floats.get("_SwingPower", 1.0), "speed": floats.get("_SwingSpeed", 1.0),
            "dist": floats.get("_SwingDistribution", 1.0), "uv": floats.get("_SwingUV", 0.0),
            "scale": scale[:3], "dir": wind[:3],
        }
    return out or None


def flipped(m: np.ndarray) -> np.ndarray:
    """Unity 월드 행렬 → 원작 좌표(x 뒤집기)의 행렬 `F·W·F` — `matrix.ts`의 `flipped`와 같다."""
    out = m.copy()
    out[0, 1:] *= -1
    out[1:, 0] *= -1
    return out


def column_major(m: np.ndarray) -> list[float]:
    """glTF 노드 행렬(열 우선) — `matrix.ts`의 `columnMajor`와 같다."""
    return [float(m[r, c]) for c in range(4) for r in range(4)]


def decompose(m: np.ndarray) -> tuple[list[float], list[float], list[float]]:
    """행 우선 4×4 → 이동 · 회전(사원수 x y z w) · 배율 — `matrix.ts`의 `decompose`와 같다. 밀림은 버린다."""
    cx, cy, cz = m[:3, 0], m[:3, 1], m[:3, 2]
    sx, sy, sz = float(np.linalg.norm(cx)), float(np.linalg.norm(cy)), float(np.linalg.norm(cz))
    det = (cx[0] * (cy[1] * cz[2] - cy[2] * cz[1]) - cy[0] * (cx[1] * cz[2] - cx[2] * cz[1])
           + cz[0] * (cx[1] * cy[2] - cx[2] * cy[1]))
    if det < 0:
        sx = -sx
    r00, r10, r20 = cx[0] / sx, cx[1] / sx, cx[2] / sx
    r01, r11, r21 = cy[0] / sy, cy[1] / sy, cy[2] / sy
    r02, r12, r22 = cz[0] / sz, cz[1] / sz, cz[2] / sz
    trace = r00 + r11 + r22
    if trace > 0:
        k = 0.5 / math.sqrt(trace + 1)
        w, x, y, z = 0.25 / k, (r21 - r12) * k, (r02 - r20) * k, (r10 - r01) * k
    elif r00 > r11 and r00 > r22:
        k = 2 * math.sqrt(1 + r00 - r11 - r22)
        w, x, y, z = (r21 - r12) / k, 0.25 * k, (r01 + r10) / k, (r02 + r20) / k
    elif r11 > r22:
        k = 2 * math.sqrt(1 + r11 - r00 - r22)
        w, x, y, z = (r02 - r20) / k, (r01 + r10) / k, 0.25 * k, (r12 + r21) / k
    else:
        k = 2 * math.sqrt(1 + r22 - r00 - r11)
        w, x, y, z = (r10 - r01) / k, (r02 + r20) / k, (r12 + r21) / k, 0.25 * k
    length = math.sqrt(x * x + y * y + z * z + w * w) or 1.0
    return [float(m[0, 3]), float(m[1, 3]), float(m[2, 3])], [x / length, y / length, z / length, w / length], [sx, sy, sz]


def euler_of(q: list[float]) -> list[float]:
    """사원수(유니티 로컬) → 오일러(도 · ZXY: `Ry·Rx·Rz`). x는 ±90도 안쪽 — `field.ts`의 `eulerOf`와 같다."""
    x, y, z, w = q
    r12 = 2 * (y * z - x * w)
    sx = max(-1.0, min(1.0, -r12))
    rad = 180 / math.pi
    if abs(sx) > 0.999999:
        r20, r00 = 2 * (x * z - y * w), 1 - 2 * (y * y + z * z)
        return [math.asin(sx) * rad, math.atan2(-r20, r00) * rad, 0.0]
    r02, r22 = 2 * (x * z + y * w), 1 - 2 * (x * x + y * y)
    r10, r11 = 2 * (x * y + z * w), 1 - 2 * (x * x + z * z)
    return [math.asin(sx) * rad, math.atan2(r02, r22) * rad, math.atan2(r10, r11) * rad]


#: DOTween 열거 `AnimationType` — 3 Rotate(월드) · 4 LocalRotate · `Ease.Linear` 1
DOTWEEN_ROTATE, DOTWEEN_LOCAL_ROTATE, DOTWEEN_LINEAR = 3, 4, 1


def moving_of(go, transform, cache: dict) -> dict | None:
    """혼자 움직이는 물체인가 — `field.ts`의 `movingOf`와 같은 규칙이다 (풍차 · 기계 · 지구본의 DOTween 회전, 석탄 더미의 Mecanim 클립).

    자식 없는 잎 물체만. DOTween은 `autoPlay` · 무한 · Restart · 선형 · 상대인 회전만 읽는다. 아니면 `None`
    """
    if len(transform.m_Children) > 0:
        return None
    spin = None
    world = False
    clip = None
    for c in go.m_Components:
        try:
            reader = c.deref()
            kind = reader.type.name
        except Exception:
            continue
        if kind == "MonoBehaviour":
            try:
                mb = reader.read_typetree()
            except Exception:
                continue
            tween = mb.get("animationType")
            if tween not in (DOTWEEN_ROTATE, DOTWEEN_LOCAL_ROTATE):
                continue
            end = mb.get("endValueV3") or {}
            secs = float(mb.get("duration", 0))
            if (not secs > 0 or mb.get("loops") != -1 or mb.get("loopType") != 0 or mb.get("easeType") != DOTWEEN_LINEAR
                    or mb.get("isRelative") != 1 or mb.get("autoPlay") != 1 or mb.get("delay") != 0 or mb.get("isFrom") != 0):
                continue
            spin = {"euler": [], "add": [end.get("x", 0.0), end.get("y", 0.0), end.get("z", 0.0)], "secs": secs}
            world = tween == DOTWEEN_ROTATE
        elif kind == "Animator":
            try:
                a = reader.read_typetree()
                ref = a.get("m_Controller") or {}
                if ref.get("m_FileID", 0) != 0 or ref.get("m_PathID", 0) == 0:
                    continue
                ctrl = c.assetsfile.objects[ref["m_PathID"]].read_typetree()
            except Exception:
                continue
            for k in ctrl.get("m_AnimationClips") or []:
                if k.get("m_FileID", 0) == 0 and k.get("m_PathID", 0) != 0 and clip is None:
                    clip = int(k["m_PathID"])
    if spin is None and clip is None:
        return None
    father = getattr(transform, "m_Father", None)
    has_father = father is not None and getattr(father, "m_PathID", 0) != 0
    world_m = world_of(transform, cache)
    parent = None if world or not has_father else world_of(father.read(), cache)
    q = transform.m_LocalRotation
    local_q = [q.x, q.y, q.z, q.w]
    if world or not has_father:
        t, r, s = decompose(flipped(world_m))
        body = {"t": t, "r": r, "s": s}
        euler_q = decompose(world_m)[1]
    else:
        p, sc = transform.m_LocalPosition, transform.m_LocalScale
        body = {"t": [-p.x, p.y, p.z], "r": [q.x, -q.y, -q.z, q.w], "s": [sc.x, sc.y, sc.z]}
        euler_q = local_q
    if spin is not None:
        spin["euler"] = euler_of(euler_q)
    return {"parent": parent, "body": body, "spin": spin, "clip": clip, "name": go.m_Name or "move"}


def top_group(transform) -> str:
    """뿌리 바로 아래 자식의 이름 — 나무열매 `kinoNNN`의 `Miki`(줄기) · `Hana`(꽃) · `Mi`(열매)"""
    chain = []
    t = transform
    while t is not None:
        chain.append(t.m_GameObject.read().m_Name)
        t = t.m_Father.read() if t.m_Father.path_id else None
    return chain[-2] if len(chain) >= 2 else chain[-1]


def export(bundle: Path, out: Path, far: float | None, max_size: int | None = None, groups: bool = False,
           plant: bool = False, motion: bool = False) -> dict:
    """`groups` 뿌리 바로 아래 자식마다 노드를 따로 둔다 · `plant` 나무열매 색 입히기 (`arena.ts`의 `plant`와 같다 — 둘은 따로 켠다) ·
    `motion` 흐름 · 흔들림 값을 `extras`로 싣는다 (`arena.ts`의 `motion` — 방이 켠다)"""
    env = UnityPy.load(str(bundle))
    filters = [o.read() for o in env.objects if o.type.name == "MeshFilter"]
    if not filters:
        raise SystemExit(f"{bundle.name}: MeshFilter가 없다")

    buf = Buffer()

    # ⚠️ **투명 여부를 짐작하지 않는다. 번들이 적어 두었다.** 재질마다
    # `stringTagMap`에 유니티의 `RenderType`이 그대로 실려 있다:
    #
    #   Opaque(큐 2000)             벽·바닥·바위 — 안 비친다
    #   TransparentCutout(큐 2450)  잎·풀 — 오려 낸다
    #   Transparent(큐 3000)        창으로 드는 빛·물안개 — 비친다
    #
    # 여태 **전부 오려 내기**로 구웠다. 그래서 체육관 안 창빛이 흰 널빤지로
    # 서 있었다 — 지난번 천관산 빛기둥과 같은 실수를 무대 쪽에서 한 번 더 한 것이다
    kinds = {}
    #: 재질마다 수 · 색 · 물린 그림 칸 (`arena.ts`의 `looks`)
    looks: dict[str, tuple[dict, dict, set]] = {}
    #: 나무열매(`plant`)만 — 재질마다 색 입히는 길 (`plant_kind`)
    plant_of: dict[str, str] = {}
    for obj in env.objects:
        if obj.type.name != "Material":
            continue
        d = obj.read_typetree()
        tags = dict(d.get("stringTagMap") or [])
        name = d.get("m_Name", "?")
        kinds[name] = tags.get("RenderType", "Opaque")
        props = d.get("m_SavedProperties", {})
        slots = {k for k, v in prop_pairs(props.get("m_TexEnvs", []))
                 if isinstance(v, dict) and v.get("m_Texture", {}).get("m_PathID", 0) != 0}
        looks[name] = (dict(prop_pairs(props.get("m_Floats", []))), dict(prop_pairs(props.get("m_Colors", []))), slots)
        if plant:
            te = dict(prop_pairs(props.get("m_TexEnvs", [])))
            plant_of[name] = plant_kind(str(d.get("m_ShaderKeywords") or ""), tex_pid(te, "_MainTex"), tex_pid(te, "_LayerTex"))

    def alpha_of(name: str) -> dict:
        kind = kinds.get(name, "Opaque")
        if kind == "Transparent":
            return {"alphaMode": "BLEND"}
        # ⚠️ Opaque도 오려 낸다. BDSP 셰이더는 `RenderType`이 Opaque인 재질에도
        # 알파 있는 그림을 물리는 자리가 있고(무대 나무·풀), 불투명으로 두면
        # 잎 사이가 사각형으로 막힌다. 문턱은 유니티의 `_Cutoff` 기본값이다
        return {"alphaMode": "MASK", "alphaCutoff": 0.5}

    # 더해서 그리는 재질 — 실행 쪽이 이름으로 골라 더한다(방 `roomShell` · 무대 `arenaLight`). 여기서는 색을 안 곱한다
    additive = {n for n, (f, _, _) in looks.items()
                if f.get("_SrcBlend") == ADD_SRC and f.get("_DstBlend") == ADD_DST}
    # **밑그림이 층 그림에 있는 재질** — `_MainTex`가 없거나 `_ColorIntensity`가 0이라 바탕이 안 보이고 `_LayerTex` × `_LayerColor`가
    # 색을 낸다. 굽도리 벽 `ComWall_0x`가 검정으로(운하 체육관 `c05r1101` 기둥의 검은 계단 띠), 물가 체육관 `c08gym0101~0103`의
    # `…_02` 바닥 · 벽이 흰 판으로 구워졌던 자리다. ⚠️ 더하는 재질은 안 돌린다 — 조명 줄기 `SpotLight_01`은 줄기 모양이 밑그림에
    # 있고 층 그림은 알파가 꽉 찬 구름 무늬라 네모난 구름 판이 된다 (`arena.ts`의 `layered`와 같다)
    layered = set()
    for n, (f, _, slots) in looks.items():
        if "_LayerTex" not in slots or ("_MainTex" in slots and f.get("_ColorIntensity", 1.0) != 0):
            continue
        if n not in additive:
            layered.add(n)

    # 알베도는 번들 통째로 한 번만 굽는다. BDSP 셰이더를 런타임에 재현하지 않기
    # 위해서다 (`bdsp_bake_albedo` 머리말). 층 그림 재질은 `_LayerTex`로 한 번 더 굽는다
    albedo = out.parent / f".{out.stem}_albedo"
    layer_dir = out.parent / f".{out.stem}_layer"
    images, textures, materials, by_name = [], [], [], {}
    samplers: list[dict] = []
    # ⚠️ **재질이 적어 둔 UV 배율을 먹여야 한다.** 무대 바닥이 배율 (11, 11)로
    # 되풀이하는 그림이다 — 안 먹이면 타일 121장이 한 장으로 늘어난다
    spec = bake(bundle, albedo, None, max_size, additive_water=True, plant=plant)
    baked = [(png.name[: -len("_albedo.png")], png, spec) for png in albedo.glob("*_albedo.png")]
    baked = [b for b in baked if b[0] not in layered]
    if layered:
        layer_spec = bake(bundle, layer_dir, None, max_size, main_props=("_LayerTex",))
        baked += [(png.name[: -len("_albedo.png")], png, layer_spec) for png in layer_dir.glob("*_albedo.png")
                  if png.name[: -len("_albedo.png")] in layered]
    # ⚠️ **재질 이름순이다** — 브라우저 변환기와 같은 차례라야 프리미티브 차례가 같다. 파일 이름(`…_albedo.png`)으로 세우면
    # `ComWall_09`와 `ComWall_09_01`의 차례가 뒤집힌다
    st_of = {}
    #: 재질 슬롯 → (`_Color`, `_LayerColor`) — `blend` 재질의 정점 색 `COLOR_0`이 이 둘을 정점 알파로 섞는다
    blend_of: dict[int, tuple[np.ndarray, np.ndarray]] = {}
    transformed = False
    #: 바람에 흔들리는 재질 슬롯 — 그 재질을 쓰는 조각에 정점 가중치 `_SWING`을 싣는다 (`motion`)
    swing_slots: set[int] = set()
    for name, png, sp in sorted(baked, key=lambda b: b[0]):
        images.append({
            "bufferView": buf.view(png.read_bytes()), "mimeType": "image/png", "name": name,
        })
        st_of[name] = tuple(sp.get(name, {}).get("uv", (1.0, 1.0, 0.0, 0.0)))
        want = dict(zip(("wrapS", "wrapT"), sp.get(name, {}).get("wrap", (10497, 10497))))
        if want not in samplers:
            samplers.append(want)
        textures.append({"source": len(images) - 1, "sampler": samplers.index(want)})
        floats, colors, _ = looks.get(name, ({}, {}, set()))
        lay = name in layered
        see = kinds.get(name) == "Transparent"
        tint = tint_of(floats, colors, lay, see) if lay or (see and name not in additive) else None
        cell = None if lay else flipbook_cell(floats.get("_PatternH", 1.0), floats.get("_PatternV", 1.0),
                                              floats.get("_StartFrameIndex", 0.0))
        transformed = transformed or cell is not None
        tex = {"index": len(textures) - 1}
        if cell:
            tex["extensions"] = {"KHR_texture_transform": cell}
        pbr = {"baseColorTexture": tex}
        # ⚠️ **나무열매는 재질 색이 곧 색이다.** 줄기 · 잎 · 꽃 그림은 회색 마스크라 안 곱하면 **하얗다** (`plant_kind`).
        #   plain  `_Color`를 `baseColorFactor`로 · mask  꽃은 그림에 구워 넣었다 · blend  잎은 정점 색 `COLOR_0`이 낸다
        if plant:
            kind = plant_of.get(name, "plain")
            if kind == "plain":
                c0, _ = plant_colors(colors)
                tint = [float(np.float32(x)) for x in c0] + [1.0]
            else:
                tint = None
            if kind == "blend":
                blend_of[len(materials)] = plant_colors(colors)
        if tint:
            pbr["baseColorFactor"] = tint
        pbr["metallicFactor"] = 0.0
        pbr["roughnessFactor"] = 0.9
        moving = motion_extras(floats, colors, lay) if motion else None
        materials.append({
            "name": name,
            "pbrMetallicRoughness": pbr,
            **alpha_of(name),
            "doubleSided": True,
            **({"extras": moving} if moving else {}),
        })
        if moving and "swing" in moving:
            swing_slots.add(len(materials) - 1)
        by_name[name] = len(materials) - 1
    for d in (albedo, layer_dir):
        if d.is_dir():
            for png in d.glob("*.png"):
                png.unlink()
            d.rmdir()

    # ⚠️ **그림 없는 재질도 재질이다.** 무대에는 `_MainTex`가 아예 없는 재질이
    # 섞여 있다 — g010의 **바닷물**(`_Color` 0, 0.295, 0.502)과 g006의 굴 안
    # **불빛**(`_Color` 1, 0.548, 0.13)이 그렇다. 무늬가 없을 뿐 색은 `_Color`에
    # 들어 있고, Unity도 이걸 불투명으로(`RenderType Opaque`, `_SrcBlend` One /
    # `_DstBlend` Zero) 그린다.
    #
    # 슬롯을 안 주면 glTF 규격상 **흰색 기본 재질**이 붙는다. 바다가 하얀 판으로
    # 깔리고 굴 안에 흰 널이 선다 — 실제로 그렇게 나왔다
    for obj in env.objects:
        if obj.type.name != "Material":
            continue
        d = obj.read_typetree()
        name = d.get("m_Name", "?")
        if name in by_name:
            continue
        props = d.get("m_SavedProperties", {})
        colors = dict(prop_pairs(props.get("m_Colors", [])))
        floats = dict(prop_pairs(props.get("m_Floats", [])))
        base = colors.get("_Color") or {"r": 1.0, "g": 1.0, "b": 1.0, "a": 1.0}
        mat = {
            "name": name,
            "pbrMetallicRoughness": {
                "baseColorFactor": [base["r"], base["g"], base["b"], base["a"]],
                "metallicFactor": 0.0,
                "roughnessFactor": 0.9,
            },
            **alpha_of(name),
            "doubleSided": True,
        }
        mixed = cascade_mix(env, d, colors, floats, max_size)
        if mixed is not None:
            images.append({"bufferView": buf.view(mixed), "mimeType": "image/png", "name": name})
            want = {"wrapS": 10497, "wrapT": 10497}
            if want not in samplers:
                samplers.append(want)
            textures.append({"source": len(images) - 1, "sampler": samplers.index(want)})
            mat["pbrMetallicRoughness"]["baseColorTexture"] = {"index": len(textures) - 1}
            mat["pbrMetallicRoughness"]["baseColorFactor"] = [1.0, 1.0, 1.0, 1.0]
        # 스스로 빛나는 것 (`_EmissionColorIntensity`가 0보다 클 때만).
        # 세기까지는 안 옮긴다 — glTF의 `emissiveFactor`는 0~1이라 4배를 실을 수 없다
        glow = colors.get("_EmissionColor")
        if glow and floats.get("_EmissionColorIntensity", 0.0) > 0:
            mat["emissiveFactor"] = [glow["r"], glow["g"], glow["b"]]
        moving = motion_extras(floats, colors, False) if motion else None
        if moving:
            mat["extras"] = moving
            if "swing" in moving:
                swing_slots.add(len(materials))
        materials.append(mat)
        by_name[name] = len(materials) - 1

    cache: dict = {}
    # 재질별로 모은다 — 메시 158개를 그대로 두면 드로우콜이 158개다
    # `groups`면 뿌리 바로 아래 자식마다 노드를 따로 둔다 — 실행 쪽이 성장 단계에 맞는 것만 켠다
    parts: dict[tuple[str, int], list[tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray | None]]] = {}
    dropped = 0
    kept = 0
    #: 혼자 움직이는 묶음(`move:<Transform>`) → 그 물체 (`moving_of`)
    movers: dict[str, dict] = {}
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
        # 혼자 움직이는 물체(풍차 · 기계 · 석탄 더미)는 제 좌표에 두고 따로 싣는다 (`arena.ts`의 `moving`과 같다)
        move = moving_of(go, transform, cache) if motion else None

        handler = MeshHelper.MeshHandler(mesh)
        handler.process()
        n = len(handler.m_Vertices)
        if n == 0:
            continue
        verts = np.array(handler.m_Vertices, dtype=np.float64).reshape(-1, 3)
        if move is None:
            verts = (world[:3, :3] @ verts.T).T + world[:3, 3]
            if far is not None and float(np.min(np.hypot(verts[:, 0], verts[:, 2]))) > far:
                dropped += 1
                continue
        kept += 1
        normals = lanes(handler.m_Normals, n, 3, [0.0, 1.0, 0.0])
        if move is None:
            normals = (world[:3, :3] @ normals.T).T
        length = np.linalg.norm(normals, axis=1, keepdims=True)
        normals = np.where(length > 1e-9, normals / np.maximum(length, 1e-9), [0.0, 1.0, 0.0])
        uv_raw = lanes(handler.m_UV0, n, 2, [0.0, 0.0]).astype(np.float32)
        # 정점 색의 알파 — 잎(`blend`)이 `_Color` ↔ `_LayerColor`를 이 값으로 섞는다. 8비트라 255로 나눈다. 없으면 흰 정점 색(알파 1)이다
        vertex_color = lanes(handler.m_Colors, n, 4, [255.0] * 4)
        vertex_alpha = (vertex_color[:, 3] / 255.0).astype(np.float32)
        # 바람 흔들림 가중치 `_SWING` = 정점 색 R × A (`motion.ts`의 `swingWeights`와 같다). 정점 색 채널이 없으면 흔들지 않는다 · float32로
        has_color = handler.m_Colors is not None and np.asarray(handler.m_Colors).size >= n * 4
        wind_all = ((vertex_color[:, 0] / 255.0).astype(np.float32) * vertex_alpha).astype(np.float32) if has_color else None
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
            slot, st = -1, (1.0, 1.0, 0.0, 0.0)
            if i < len(mats):
                try:
                    mat_name = mats[i].read().m_Name
                    slot = by_name.get(mat_name, -1)
                    st = st_of.get(mat_name, st)
                except Exception:
                    slot = -1
            sx, sy, ox, oy = st
            # Unity는 UV 원점이 왼쪽 아래, glTF는 왼쪽 위다
            uv = np.stack([uv_raw[:, 0] * sx + ox,
                           1.0 - (uv_raw[:, 1] * sy + oy)], axis=1).astype(np.float32)
            # 잎 — `COLOR_0` = lerp(_Color, _LayerColor, 정점 알파) (선형 · 알파 1). ⚠️ 알파 높은 곳(줄기 쪽)이 더 어두운 `_LayerColor`다
            # (잎 181장에서 알파는 잎자루에서 멀수록 낮다 — 78%) · 순서는 float32로 한 단계씩 (`arena.ts`와 바이트가 같게)
            col = None
            if slot in blend_of:
                base, top = blend_of[slot]
                one = np.float32(1)
                rgb = base[None, :] * (one - vertex_alpha)[:, None] + top[None, :] * vertex_alpha[:, None]
                col = np.concatenate([rgb, np.ones((n, 1), np.float32)], axis=1).astype(np.float32)
            wind = wind_all if slot in swing_slots else None
            # 묶음 이름 = 이름 + 월드 자리(세 자리) — `arena.ts`와 같다 (PathID는 그쪽에서 64비트가 뭉개진다)
            def at(v: float) -> str:
                return f"{0.0 if abs(v) < 5e-4 else v:.3f}"
            group = (f"move:{move['name']}:{at(world[0, 3])}:{at(world[1, 3])}:{at(world[2, 3])}" if move
                     else (top_group(transform) if groups else bundle.name))
            if move:
                movers[group] = move
            parts.setdefault((group, slot), []).append((
                verts.astype(np.float32), normals.astype(np.float32), uv, tri, col, wind,
            ))

    meshes: dict[str, list[dict]] = {}
    total_v = total_t = 0
    for (group, slot), chunks in sorted(parts.items()):
        primitives = meshes.setdefault(group, [])
        pos, nrm, tex, idx, cols, winds = [], [], [], [], [], []
        base = 0
        for v, nn, u, t, cc, ww in chunks:
            pos.append(v)
            nrm.append(nn)
            tex.append(u)
            idx.append(t + base)
            if cc is not None:
                cols.append(cc)
            if ww is not None:
                winds.append(ww)
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
        if cols:
            prim["attributes"]["COLOR_0"] = buf.add(np.concatenate(cols), "VEC4", FLOAT, ARRAY)
        # 모든 조각에 가중치가 있을 때만 싣는다 (`arena.ts`의 `wind`와 같다)
        if winds and len(winds) == len(chunks):
            prim["attributes"]["_SWING"] = buf.add(np.concatenate(winds), "SCALAR", FLOAT, ARRAY)
        if slot >= 0:
            prim["material"] = slot
        primitives.append(prim)

    # 노드 — 합친 묶음은 노드 하나, 움직이는 것은 닻(부모 월드 · 정지) → 몸(제 로컬 TRS · 움직임) 둘 (`arena.ts`와 같다)
    nodes: list[dict] = []
    body_of: dict[int, dict] = {}
    for i, g in enumerate(meshes):
        mv = movers.get(g)
        if mv is None:
            nodes.append({"name": g, "mesh": i})
            continue
        body = {"name": mv["name"], "mesh": i, "translation": mv["body"]["t"], "rotation": mv["body"]["r"],
                "scale": mv["body"]["s"]}
        if mv["spin"] is not None:
            body["extras"] = {"spin": mv["spin"]}
        if mv["parent"] is not None:
            nodes.append({"name": f"{mv['name']}/anchor", "matrix": column_major(flipped(mv["parent"])),
                          "children": [len(nodes) + 1]})
        body_of[len(nodes)] = mv
        nodes.append(body)
    animations: list[dict] = []
    for node, mv in body_of.items():
        if mv["clip"] is None:
            continue
        from bdspGlb import build_animations
        made, _ = build_animations(env, buf, {0: node}, None, False, {mv["clip"]})
        animations += [{**a, "name": mv["name"]} for a in made]
    kids = {c for n in nodes for c in n.get("children", [])}

    gltf = {
        "asset": {"version": "2.0", "generator": "radiant-platinum bdspArena"},
        "scene": 0,
        "scenes": [{"nodes": [i for i in range(len(nodes)) if i not in kids]}],
        "nodes": nodes,
        "meshes": [{"name": g, "primitives": p} for g, p in meshes.items()],
        "materials": materials,
        "textures": textures,
        "images": images,
        "accessors": buf.accessors,
        "bufferViews": buf.views,
        "buffers": [{"byteLength": len(buf.blob)}],
    }
    # 빈 배열은 glTF가 안 받는다
    if samplers:
        gltf["samplers"] = samplers
    if animations:
        gltf["animations"] = animations
    # TV 화면의 첫 칸 (`flipbook_cell`) — 적어 두어야 로더가 읽는다
    if transformed:
        gltf["extensionsUsed"] = ["KHR_texture_transform"]
    write_glb(out, gltf, bytes(buf.blob))

    every = np.concatenate([c[0] for chunks in parts.values() for c in chunks])
    return {
        "메시": kept,
        "버린 메시": dropped,
        "정점": int(total_v),
        "삼각형": int(total_t),
        "재질": len(materials),
        "드로우콜": sum(len(p) for p in meshes.values()),
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


ROOT = Path(__file__).resolve().parents[2]
TABLE = ROOT / "src/engine/battle/arena.ts"
GROUND = require_dir("bdsp.arenas") / "ground"
OUTDIR = ROOT / "public/models/arena"
#: 실내 방 (docs/orders/VISUAL_20260929.md §5). 이름이 원작 내부 맵 이름과 같다(`C01R0101` ↔ `maps.json`의 `name`)
ROOMS = require_dir("bdsp.environments") / "prefab_map"
ROOM_OUT = ROOT / "public/models/room"
#: 방 그림 긴 변의 상한. 방 225벌을 원본 해상도(512~1024)로 구우면 설치본이 수백 MB 는다
ROOM_TEXTURE = 512
#: **던전(`d##`)은 안 굽는다** — 동굴 · 탄광 · 숲은 기하가 무겁다(138벌 856MB · 한 벌에 삼각형 39만 개). 원작도 입체인 자리라
#: 야외와 함께 기하를 줄이는 길(양자화)을 갖춘 뒤에 다룬다. 건물 안 117벌은 146MB다
DUNGEON = "d"
#: 나무열매 나무 (docs/orders/BATTLE_FX_20261004.md §2). `kino001`~`kino064`가 열매(`berries.json` 번호 1~64)마다 한 벌이고
#: `kinoseeding`이 싹이다. 065는 BDSP가 더한 열매라 우리 열매 표에 짝이 없다. 한 벌은 `Miki`(줄기 · 잎) · `Hana`(꽃) · `Mi`(열매)
#: 세 묶음이라 묶음마다 노드를 따로 둔다 — 실행 쪽(`scene/BerryPatchProps`)이 성장 단계에 맞는 것만 켠다
GIMMICK = require_dir("bdsp.environments") / "gimmick"
BERRY_OUT = ROOT / "public/models/berry"
BERRY_COUNT = 64
BERRY_SEEDING = "kinoseeding"
#: 나무 그림 긴 변의 상한. 나무는 한 칸 안에 서는 작은 물건이라 256이면 텍셀이 남는다 — 브라우저 변환기(`convert.ts`)의 `BERRY_TEXTURE`와 같아야 한다
BERRY_TEXTURE = 256
#: 필드 기믹 (docs/orders/BATTLE_FX_20261004.md §8 · DATA.md §2.17.9). BDSP가 필드 glb에 안 굽고 기믹 번들로 따로 두는 것들이다 —
#: 바위깨기 바위 · 풀베기 나무 · 눈덩이 · 괴력 바위는 정적 메시라 이 변환기로, 꿀나무는 뼈 넷과 흔들림 클립 넷이 있어 인물
#: 변환기(`bdspGlb`)로 굽는다. 목록은 `src/engine/world/gimmicks.ts`의 `GIMMICK_MODELS`와 같아야 한다
GIMMICK_OUT = ROOT / "public/models/gimmick"
GIMMICK_STATIC = ["obj0001_00", "obj0002_00", "obj0004_00", "obj0006_00"]
GIMMICK_ANIMATED = ["obj0003_00"]
#: 기믹 그림 긴 변의 상한. 넷은 원본이 256이고 꿀나무만 512다(세 칸 높이 나무라 1인칭으로 올려다본다) — 원본 그대로 싣는다.
#: 브라우저 변환기(`convert.ts`)의 `GIMMICK_TEXTURE`와 같아야 한다
GIMMICK_TEXTURE = 512


def wanted() -> list[str]:
    """구워야 할 무대 이름들.

    ⚠️ **목록은 여기 안 적는다.** 어느 배경이 어느 무대를 쓰는지는
    `src/engine/battle/arena.ts`가 유일한 임자다. 여기에 한 벌 더 적어 두면
    표에 무대를 하나 더 붙인 날 굽는 것을 빠뜨리고, 그러면 그 배경을 쓰는
    맵에서만 배틀이 빈 땅 위에 열린다 — 그 맵에 들어가 보기 전에는 모른다
    """
    text = TABLE.read_text(encoding="utf-8")
    names = re.findall(r"file: '(g\d+)\.glb'", text)
    if not names:
        raise SystemExit(f"{TABLE}에서 무대 이름을 못 찾았다")
    return sorted(set(names))


def room_names() -> list[str]:
    """방 번들 전부 (`prefab_map`의 파일 255벌).

    ⚠️ **우리 맵과 짝이 맞는 것만 고르지 않는다.** 짝은 실행 때 맺는다(`scene/BdspRoom`의 `roomFor` — 이름이 먼저 · 없으면 같은
    행렬의 다른 맵). 여기서 고르면 브라우저 설치기도 `maps.json`을 읽어 같은 표를 세워야 하고, 두 굽는 쪽이 갈라질 자리가 는다
    """
    return sorted(p.name for p in ROOMS.iterdir() if p.is_file() and not p.name.startswith(DUNGEON))


def bake_rooms(names: list[str]) -> int:
    names = names or room_names()
    print(f"방 {len(names)}벌")
    total = 0
    for name in names:
        stat = export(ROOMS / name, ROOM_OUT / f"{name}.glb", None, ROOM_TEXTURE, motion=True)
        total += stat["바이트"]
        print(f"  {name}  삼각형 {stat['삼각형']:>7,} · 재질 {stat['재질']:>2} · {stat['바이트'] / 1e6:.1f}MB")
    # 목차는 **구운 것 전부**다 — 한 벌만 다시 구워도 목차가 줄지 않게 폴더를 센다
    made = sorted(p.stem for p in ROOM_OUT.glob("*.glb"))
    # ⚠️ **브라우저 설치기와 같은 바이트로 쓴다** — `JSON.stringify`처럼 빈칸 없이(`json()` · 설치본을 노드 산출물과 바이트로 견준다)
    (ROOM_OUT / "index.json").write_text(json.dumps({"rooms": made}, separators=(",", ":")), encoding="utf-8")
    print(f"모두 {total / 1e6:.1f}MB · 목차 {len(made)}벌")
    return 0


def berry_names() -> list[str]:
    return [f"kino{i:03d}" for i in range(1, BERRY_COUNT + 1)] + [BERRY_SEEDING]


def bake_berries() -> int:
    names = berry_names()
    print(f"나무열매 {len(names)}벌")
    total = 0
    for name in names:
        stat = export(GIMMICK / name, BERRY_OUT / f"{name}.glb", None, BERRY_TEXTURE, groups=True, plant=True)
        total += stat["바이트"]
        print(f"  {name}  삼각형 {stat['삼각형']:>5,} · 재질 {stat['재질']:>2} · {stat['바이트'] / 1e3:.0f}KB")
    # 목차는 **구운 것 전부**다 — 브라우저 설치기와 같은 바이트로(빈칸 없이)
    made = sorted(p.stem for p in BERRY_OUT.glob("*.glb"))
    (BERRY_OUT / "index.json").write_text(json.dumps({"berries": made}, separators=(",", ":")), encoding="utf-8")
    print(f"모두 {total / 1e6:.1f}MB · 목차 {len(made)}벌")
    return 0


def bake_gimmicks() -> int:
    from bdspGlb import export as export_model

    names = GIMMICK_STATIC + GIMMICK_ANIMATED
    print(f"기믹 {len(names)}벌")
    total = 0
    for name in GIMMICK_STATIC:
        # 재질 색(`_Color`)을 곱하는 길은 나무열매와 같다 — 넷 다 `plain`이라 `baseColorFactor`가 실린다(눈덩이 0.95)
        stat = export(GIMMICK / name, GIMMICK_OUT / f"{name}.glb", None, GIMMICK_TEXTURE, groups=True, plant=True)
        total += stat["바이트"]
        print(f"  {name}  삼각형 {stat['삼각형']:>5,} · {stat['가로']}×{stat['높이']}×{stat['세로']} · {stat['바이트'] / 1e3:.0f}KB")
    for name in GIMMICK_ANIMATED:
        out = GIMMICK_OUT / f"{name}.glb"
        stat = export_model(GIMMICK / name, out, max_texture=GIMMICK_TEXTURE, entity_clips=True)
        total += out.stat().st_size
        print(f"  {name}  삼각형 {stat['triangles']:>5,} · 뼈 {stat['bones']} · 클립 {stat['clips']} · {out.stat().st_size / 1e3:.0f}KB")
    made = sorted(p.stem for p in GIMMICK_OUT.glob("*.glb"))
    (GIMMICK_OUT / "index.json").write_text(json.dumps({"gimmicks": made}, separators=(",", ":")), encoding="utf-8")
    print(f"모두 {total / 1e3:.0f}KB · 목차 {len(made)}벌")
    return 0


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("bundle", type=Path, nargs="?")
    ap.add_argument("-o", "--out", type=Path)
    ap.add_argument("--all", action="store_true",
                    help=f"{TABLE.name}에 실린 무대를 전부 굽는다")
    ap.add_argument("--rooms", nargs="*", default=None,
                    help="실내 방을 굽는다. 이름을 안 주면 전부")
    ap.add_argument("--berries", action="store_true",
                    help="나무열매 나무(kino001~064 + 싹)를 묶음별 노드로 굽는다")
    ap.add_argument("--gimmicks", action="store_true",
                    help="필드 기믹(바위깨기 · 풀베기 · 눈덩이 · 괴력 · 꿀나무)을 굽는다")
    ap.add_argument("--far", type=float, default=None,
                    help="무대 한가운데에서 이보다 먼 메시는 버린다 (m)")
    args = ap.parse_args()

    if args.berries:
        return bake_berries()

    if args.gimmicks:
        return bake_gimmicks()

    if args.rooms is not None:
        return bake_rooms(args.rooms)

    if args.all:
        names = wanted()
        print(f"무대 {len(names)}벌: {' '.join(names)}")
        total = 0
        for name in names:
            out = OUTDIR / f"{name}.glb"
            stat = export(GROUND / name, out, args.far)
            total += stat["바이트"]
            print(f"  {name}  삼각형 {stat['삼각형']:>7,} · 재질 {stat['재질']:>2}"
                  f" · {stat['바이트'] / 1e6:.1f}MB")
        print(f"모두 {total / 1e6:.1f}MB")
        return 0

    if args.bundle is None or args.out is None:
        raise SystemExit("번들과 -o를 대거나 --all을 쓴다")
    stat = export(args.bundle, args.out, args.far)
    print(args.out)
    for k, v in stat.items():
        print(f"  {k}: {v}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

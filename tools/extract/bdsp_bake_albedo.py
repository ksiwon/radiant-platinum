"""BDSP 캐릭터 알베도 베이크 (PLAN §4.3).

BDSP 캐릭터 셰이더는 색을 텍스처가 아니라 머티리얼 파라미터에 둔다:

    albedo = _MainTex(그레이스케일 음영) × 레이어색[_MaskTex 채널]

_MaskTex는 순수 R/G/B/검정 영역으로 칠해진 선택자다:
    R → _SkinColor,  G → _PrimaryColor,  B → _SecondaryColor,  검정 → 틴트 없음

(_SkinColor는 피부 전용이 아니라 첫 번째 범용 레이어 색이다 — 가방은 노랑, 모자는 분홍이 들어간다.)
차례의 근거는 아래 MASK_CHANNEL_PROPS에 적어 두었다.

이 스크립트는 위 식을 오프라인에서 계산해 평범한 알베도 PNG로 굽는다. 런타임에서
BDSP 셰이더를 재현할 필요가 없어지고, KTX2 압축(§4.4)에도 그대로 태울 수 있다.

사용법:
    python tools/extract/bdsp_bake_albedo.py <에셋번들> -o <출력디렉터리>
"""

from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np
import UnityPy
from PIL import Image


def to_linear(v: float) -> float:
    """Unity가 저장한 색은 선형이다. sRGB 텍스처와 곱하려면 공간을 맞춰야 한다."""
    return v


def linear_to_srgb(x: np.ndarray) -> np.ndarray:
    return np.where(x <= 0.0031308, x * 12.92, 1.055 * np.power(np.clip(x, 0, None), 1 / 2.4) - 0.055)


def srgb_to_linear(x: np.ndarray) -> np.ndarray:
    return np.where(x <= 0.04045, x / 12.92, np.power((x + 0.055) / 1.055, 2.4))


def prop_pairs(entries):
    for e in entries:
        k, v = e if isinstance(e, (list, tuple)) else (e["first"], e["second"])
        if isinstance(k, dict):
            k = k.get("name", str(k))
        yield k, v


# ① _MaskTex의 RGB 채널 → 셰이더 색 프로퍼티.
#    실제 게임 화면과 대조해 확정: 조끼(R)=검정 _Skin, 치마(G)=분홍 _Primary,
#    목도리·비니몸통(B)=빨강·흰색 _Secondary, 비니 엠블럼(R)=분홍 _Skin.
MASK_CHANNEL_PROPS = ["_SkinColor", "_PrimaryColor", "_SecondaryColor"]

# ② ColorVariation 컴포넌트의 channel 인덱스 → 같은 프로퍼티. **①과 순서가 같다.**
#
# 근거 — `ColorIndex`가 가리키는 프리셋은 그 인물의 **기본 외형**이므로 그 색은
# 머티리얼에 박힌 기본값과 같아야 한다. 그러면 채널이 어느 프로퍼티인지가 색으로
# 정해진다. 인물 108명을 훑어 ColorVariation을 가진 여섯(fc1085·fc2005·pc0001·
# pc0002)의 40건을 대조했다:
#
#   ch0 → _SkinColor       14/14
#   ch1 → _PrimaryColor    19/24  (나머지 다섯은 주인공 커스터마이즈 프리셋이라
#                                  기본값과 다른 것이 맞다)
#   ch2 → _SecondaryColor   2/2
#
# ⚠️ **여기가 엄마 얼굴을 파랗게 칠하던 자리다.** `fc2005_00`의 face는
# _MaskTex가 92% R(=_SkinColor)인데, 순서를 한 칸 돌려 읽으면 ch2의 머리색
# (0.275,0.388,0.549)이 _SkinColor 자리에 들어간다 — 눈가에 파란 가면이 씌워졌다.
# ColorVariation이 없는 인물 102명은 기본값 그대로라 아무 표시도 안 났다
VARIATION_CHANNEL_PROPS = MASK_CHANNEL_PROPS

# 유니티 랩 모드 → glTF 샘플러 상수. `MirrorOnce`(3)는 glTF에 없어서 거울로 본다
GLTF_WRAP = {0: 10497, 1: 33071, 2: 33648, 3: 33648}


def wrap_of(tex) -> tuple[int, int]:
    """텍스처가 스스로 적어 둔 U·V 반복 방식. **읽어야 한다** — 기본값으로
    두면 포켓몬이 좌우로 갈린다 (`bdspGlb` 머리말)."""
    u, v = raw_wrap(tex)
    return GLTF_WRAP.get(u, 10497), GLTF_WRAP.get(v, 10497)


def raw_wrap(tex) -> tuple[int, int]:
    """유니티 값 그대로. 오프라인에서 겹칠 때는 glTF 상수가 아니라 이쪽이 필요하다"""
    s = getattr(tex, "m_TextureSettings", None)
    u = getattr(s, "m_WrapU", None)
    v = getattr(s, "m_WrapV", None)
    if u is None or v is None:
        d = tex.object_reader.read_typetree().get("m_TextureSettings", {})
        u, v = d.get("m_WrapU", 0), d.get("m_WrapV", 0)
    return int(u), int(v)


# `_BlendMode` → glTF `alphaMode` (`m_Floats`에 재질이 적어 둔다).
#
# ⚠️ **여기를 안 읽고 전부 `MASK`로 굽던 자리다.** 그러면 알파가 낮은 자리가
# 통째로 뚫린다 — 493종 중 143종이 그랬고, 제일 눈에 띈 것이 **눈**이었다.
#
#   0 불투명   SrcBlend=One,      DstBlend=Zero            → 알파는 불투명도가 아니다
#   1 반투명   SrcBlend=SrcAlpha, DstBlend=OneMinusSrcAlpha → 알파가 곧 불투명도다
#   2 가산     SrcBlend=SrcAlpha, DstBlend=One             → glTF에 없다. 아래 참조
#
# 실측(포켓몬 481종 2,869재질): 0이 2,780 · 1이 70 · 2가 19.
#
# ⚠️ **가산은 glTF에 없다.** 슬러그마의 속불빛(`BodyInc`)이 그렇다 — 원판은
# 배경에 더하는데 여기서는 반투명으로 얹는다. 불빛이 원작보다 덜 밝게 나온다
GLTF_ALPHA = {0: "OPAQUE", 1: "BLEND", 2: "BLEND"}


def floats_of(props) -> dict[str, float]:
    return {k: float(v) for k, v in prop_pairs(props.get("m_Floats", []))}


def wrap_uv(x: np.ndarray, mode: int) -> np.ndarray:
    """유니티 랩 모드대로 [0,1] 안으로 접는다. 0 Repeat · 1 Clamp · 2·3 Mirror"""
    if mode == 1:
        return np.clip(x, 0.0, 1.0)
    if mode in (2, 3):
        y = np.abs(x) % 2.0
        return np.where(y > 1.0, 2.0 - y, y)
    return x % 1.0


def bilinear(img: np.ndarray, u: np.ndarray, v: np.ndarray) -> np.ndarray:
    """`img`(PIL 순서, 위가 0행)를 (u, v)에서 겹선형으로 읽는다. v는 위에서 잰다"""
    h, w = img.shape[:2]
    fx, fy = u * w - 0.5, v * h - 0.5
    x0, y0 = np.floor(fx).astype(np.int64), np.floor(fy).astype(np.int64)
    dx, dy = (fx - x0)[..., None], (fy - y0)[..., None]

    def at(x, y):
        return img[np.clip(y, 0, h - 1), np.clip(x, 0, w - 1)]

    return (at(x0, y0) * (1 - dx) * (1 - dy) + at(x0 + 1, y0) * dx * (1 - dy)
            + at(x0, y0 + 1) * (1 - dx) * dy + at(x0 + 1, y0 + 1) * dx * dy)


def layer_under(main_tex, main_st, layer_tex, layer_st, shape) -> np.ndarray:
    """2층 그림을 **1층 그림의 좌표계로** 옮겨 온다 (선형 RGB).

    두 층은 UV 배율이 서로 다르다 — 눈은 1층이 (2,1)이고 2층(홍채)이 (4,4)다.
    그래서 그냥 겹치면 홍채가 엉뚱한 자리에 앉는다. 메시 UV를 한 번 거슬러
    올라갔다가 2층 배율로 다시 내려온다:

        u_mesh = (u₀ − off₀) / scale₀        →      u₁ = u_mesh × scale₁ + off₁

    `v`는 유니티가 아래에서 재고 PIL은 위에서 재므로 한 번 뒤집는다.
    """
    h, w = shape
    sx, sy, ox, oy = main_st
    lx, ly, lox, loy = layer_st
    sx = sx or 1.0
    sy = sy or 1.0
    # 1층 텍셀 한가운데의 유니티 UV
    u0 = ((np.arange(w) + 0.5) / w)[None, :]
    v0 = (1.0 - (np.arange(h) + 0.5) / h)[:, None]
    u1 = (u0 - ox) / sx * lx + lox
    v1 = (v0 - oy) / sy * ly + loy
    wu, wv = raw_wrap(layer_tex)
    img = np.asarray(layer_tex.image.convert("RGBA"), dtype=np.float32) / 255.0
    img = np.concatenate([srgb_to_linear(img[..., :3]), img[..., 3:]], axis=2)
    return bilinear(img, wrap_uv(np.broadcast_to(u1, (h, w)), wu),
                    wrap_uv(np.broadcast_to(1.0 - v1, (h, w)), wv))


def color_overrides(env, color_index: int | None = None) -> dict[int, dict[int, dict]]:
    """`ColorVariation` 컴포넌트가 지정하는 머티리얼별 채널 색을 읽는다.

    머티리얼에 박힌 _PrimaryColor 등은 기본값일 뿐이고, BDSP는 이 컴포넌트로
    렌더러·머티리얼·채널 단위 색을 런타임에 덮어쓴다. 주인공은 외형 커스터마이즈가
    있어서 Property00~03에 프리셋이 여러 벌 들어 있고 ColorIndex가 기본값을 고른다.

    반환: {머티리얼 PathID: {채널 인덱스: 색}}
    """
    # 렌더러 PathID → 머티리얼 PathID 목록
    renderer_mats: dict[int, list[int]] = {}
    for obj in env.objects:
        if obj.type.name not in ("SkinnedMeshRenderer", "MeshRenderer"):
            continue
        d = obj.read_typetree()
        renderer_mats[obj.path_id] = [m.get("m_PathID") for m in d.get("m_Materials", [])]

    out: dict[int, dict[int, dict]] = {}
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            d = obj.read_typetree()
        except Exception:
            continue
        if "ColorIndex" not in d or "Property00" not in d:
            continue

        idx = color_index if color_index is not None else int(d.get("ColorIndex", 0))
        entries = d.get(f"Property{idx:02d}") or d.get("Property00") or []
        for group in entries:
            rid = group.get("renderer", {}).get("m_PathID")
            mats = renderer_mats.get(rid, [])
            for c in group.get("colors", []):
                mi = c.get("materialIndex", -1)
                if not (0 <= mi < len(mats)):
                    continue
                out.setdefault(mats[mi], {})[int(c.get("channel", 0))] = c["color"]
    return out


def effect_albedo(name, colors, slots, uvs, spec: dict, outdir: Path,
                  max_size: int | None) -> bool:
    """불꽃·연기·오라처럼 **색이 재질에 적혀 있는** 조각을 albedo로 굽는다.

    ⚠️ **이걸 안 하면 하얀 덩어리가 붙는다.** BDSP의 불·연기는 색 텍스처가
    없다 — 리자몽 꼬리불은 `_BaseColor`(1.0, 0.196, 0.102)와
    `_LayerColor`(0.941, 0.808, 0.0), 또가스 연기는 `_BaseColor`
    (0.85, 0.82, 0.615)가 재질에 그대로 적혀 있고, 모양은 마스크 그림이 낸다.
    한동안 이 재질들을 통째로 건너뛰었는데, 그러면 조각에 재질이 안 붙고
    three가 **기본 흰색**으로 그린다 — 리자몽 꼬리에 흰 덩어리가 달렸다.
    실측: 그런 조각이 54종 233개다.

    ⚠️ **마스크는 그리지 않는다.** `FireMask`·`SmokeMask`에는 `_BaseColor`가
    없고 `_Color`만 하얗다. 셰이더 키워드가 `MASK_CALC_MODE_ADD`이고 스텐실을
    쓰는, **깎아 내는 도구**지 보이는 면이 아니다. 색이 없으면 여기서 `False`를
    돌려주고 `bdspGlb`가 그 조각을 통째로 뺀다
    """
    base = colors.get("_BaseColor")
    if base is None:
        return False
    layer = colors.get("_LayerColor", base)
    rgb = np.array([[to_linear(base[k]) for k in ("r", "g", "b")]], dtype=np.float32)
    top = np.array([[to_linear(layer[k]) for k in ("r", "g", "b")]], dtype=np.float32)

    # 모양은 마스크가 낸다. `_Blend0Tex`가 세기, `_Blend1Tex`/`_LerpTex`가 두 색을
    # 섞는 비율이다. 마스크가 아예 없는 재질(또가스 연기)은 제 색으로 꽉 찬 면이다
    shape_tex = next((slots[p] for p in ("_Blend0Tex", "_LerpTex", "_Mask0Tex") if p in slots), None)
    mix_tex = next((slots[p] for p in ("_Blend1Tex", "_LerpTex") if p in slots), None)
    if shape_tex is None:
        rgba = np.concatenate([linear_to_srgb(rgb), np.ones((1, 1), np.float32)], axis=1)
        img = Image.fromarray((rgba.reshape(1, 1, 4) * 255).astype(np.uint8), "RGBA")
        st = (1.0, 1.0, 0.0, 0.0)
        wrap = (10497, 10497)
    else:
        tex = shape_tex.read()
        mask = np.asarray(tex.image.convert("L"), dtype=np.float32)[..., None] / 255.0
        blend = mask if mix_tex is None else (
            np.asarray(mix_tex.read().image.convert("L").resize(tex.image.size),
                       dtype=np.float32)[..., None] / 255.0)
        lin = rgb.reshape(1, 1, 3) * (1 - blend) + top.reshape(1, 1, 3) * blend
        rgba = np.concatenate([linear_to_srgb(lin), mask], axis=2)
        img = Image.fromarray((np.clip(rgba, 0, 1) * 255).astype(np.uint8), "RGBA")
        key = next(p for p in ("_Blend0Tex", "_LerpTex", "_Mask0Tex") if p in slots)
        st = uvs[key]
        wrap = wrap_of(tex)
    if max_size is not None and max(img.size) > max_size:
        scale = max_size / max(img.size)
        img = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))))
    img.save(outdir / f"{name}_albedo.png")
    # 불빛은 뒤가 비쳐야 한다. 원판은 가산인데 glTF에 없어서 반투명으로 얹는다
    spec[name] = {"uv": st, "wrap": wrap, "alpha": "BLEND", "double": True}
    return True


def carved_shells(env, main_props: tuple[str, ...]) -> set[str]:
    """**깎개가 깊이로 깎아 내는 알맹이**의 이름 — 우리는 그 깎기를 못 한다.

    ⚠️ 또도가스(`pm0110`)의 연기가 **몸을 통째로 가리는 크림색 구**로 섰다
    (`.audit/mon/before-110.png`). 굽는 쪽 둘이 갈린 것이 아니라 둘 다 그렇게
    그렸다 — 원판에서 연기의 모양을 내는 것이 색 그림이 아니라 **깊이 버퍼로
    깎아 내는 짝**(`SmokeMask*`)인데, glTF에는 그 단계가 없다.

    재질이 스스로 무엇인지 적어 뒀다 (`.audit/maskRule.mjs`가 종·판 557개를 훑었다):

        고오스 `SmokeMask`            `MASK_FIRST_UV_ZERO`             _ZWrite=0
        리자몽 `FireMask`             `MASK_CALC_MODE_ADD …`           _ZWrite=1
        파이어 `FireMaskA00`          `MASK_CALC_MODE_MULTIPLY …`      _ZWrite=1
        또가스·또도가스·코터스        `MASK_FIRST_UV_ZERO _ZWRITE_ON`  _ZWrite=1

    앞 셋은 화면이 멀쩡하고 넷째만 통짜 구가 된다. `MASK_CALC_MODE_*`가 붙은
    깎개는 **색을 섞는** 도구고, 그것 없이 깊이만 켠 깎개가 **깎아 내는** 도구다.

    ⚠️ **그렇다고 다 빼면 안 된다.** 같은 잣대에 코터스(`pm0324`)도 걸리는데 그
    연기는 등딱지 옆·위에 떠 있어서 몸을 안 가린다 (`.audit/mon/before-324.png`).
    그래서 **몸을 통째로 감싸는 것만** 뺀다 — 렌더러가 적어 둔 `m_AABB`로
    가른다 (`.audit/effectWrap.mjs`).

    ⚠️ **브라우저 변환기와 같아야 한다** (`src/import/bdsp/albedo.ts`의
    `carvedShells`). 한쪽만 고치면 설치본에만 연기가 남는다
    """
    carved: set[str] = set()
    effect: set[str] = set()
    for obj in env.objects:
        if obj.type.name != "Material":
            continue
        d = obj.read_typetree()
        name = d.get("m_Name", "?")
        props = d.get("m_SavedProperties", {})
        tex = dict(prop_pairs(props.get("m_TexEnvs", [])))

        def has(prop: str) -> bool:
            v = tex.get(prop)
            return isinstance(v, dict) and v.get("m_Texture", {}).get("m_PathID", 0) != 0

        if not any(has(p) for p in main_props):
            effect.add(name)
        # 알맹이에는 `_BaseColor`가 있고 깎개에는 없다
        if "_BaseColor" in dict(prop_pairs(props.get("m_Colors", []))):
            continue
        words = str(d.get("m_ShaderKeywords") or "").split()
        if "_ZWRITE_ON" not in words:
            continue
        if any(w.startswith("MASK_CALC_MODE_") for w in words):
            continue
        at = name.rfind("Mask")
        if at < 0:
            continue
        carved.add(name[:at] + "Core" + name[at + 4:])
    if not carved:
        return carved

    names_of = {}
    for obj in env.objects:
        if obj.type.name == "Material":
            names_of[obj.path_id] = obj.read_typetree().get("m_Name", "")
    boxes = []
    for obj in env.objects:
        if obj.type.name not in ("SkinnedMeshRenderer", "MeshRenderer"):
            continue
        d = obj.read_typetree()
        aabb = d.get("m_AABB")
        if not aabb:
            continue
        c, x = aabb["m_Center"], aabb["m_Extent"]
        mid = (c["x"], c["y"], c["z"])
        half = (x["x"], x["y"], x["z"])
        used = [names_of.get(m.get("m_PathID", 0), "") for m in d.get("m_Materials", [])]
        boxes.append((tuple(m - h for m, h in zip(mid, half)),
                      tuple(m + h for m, h in zip(mid, half)), used))
    body = [b for b in boxes if b[2] and all(n not in effect for n in b[2])]
    if not body:
        return set()
    bmin = tuple(min(b[0][i] for b in body) for i in range(3))
    bmax = tuple(max(b[1][i] for b in body) for i in range(3))

    out: set[str] = set()
    for lo, hi, used in boxes:
        if not all(lo[i] <= bmin[i] and hi[i] >= bmax[i] for i in range(3)):
            continue
        out.update(n for n in used if n in carved)
    return out


def bake(bundle, outdir: Path, color_index: int | None = None,
         max_size: int | None = None,
         main_props: tuple[str, ...] = ("_MainTex",)) -> dict[str, dict]:
    """번들의 머티리얼을 평범한 albedo PNG로 굽는다.

    돌려주는 것은 **머티리얼 이름 → 그 그림을 어떻게 읽어야 하는가**다:
    `uv`(배율·오프셋), `wrap`(glTF 샘플러 상수 둘), `alpha`(glTF alphaMode),
    `double`(양면인가). 그림만 굽고 이것들을 버리면 UV가 어디에 앉는지,
    무엇이 뚫리는지가 달라진다.

    `max_size`를 주면 긴 변을 그만큼으로 줄인다. **오버월드 NPC 때문에 있다** —
    번들 하나가 1024짜리 넉 장을 들고 나오면 glb가 5MB고, 마흔 몇 명을 세우면
    그것만 200MB다. 주인공(`dawn.glb`)과 배틀 무대는 안 준다.

    `bundle`은 여러 개일 수 있다. **포켓몬이 그렇다** — 배틀 프리팹에 머티리얼이
    있고 메시·텍스처는 `pokemons/common` 쪽 번들 둘에 있다.

    `main_props`는 알베도를 찾을 자리다. 인물·무대는 `_MainTex`지만 포켓몬
    셰이더는 `_Col0Tex`에 색을 싣는다 — 이름만 다르고 하는 일은 같다
    (`pm0387_00_00_Body_col`이 실제로 초록·노랑이 칠해진 그림이다).
    """
    paths = [bundle] if isinstance(bundle, (str, Path)) else list(bundle)
    env = UnityPy.load(*[str(p) for p in paths])
    textures = {o.path_id: o for o in env.objects if o.type.name == "Texture2D"}
    overrides = color_overrides(env, color_index)
    carved = carved_shells(env, main_props)
    if overrides:
        print(f"  ColorVariation: 머티리얼 {len(overrides)}개에 채널 색 오버라이드 적용")

    outdir.mkdir(parents=True, exist_ok=True)
    spec: dict[str, dict] = {}

    for obj in env.objects:
        if obj.type.name != "Material":
            continue
        d = obj.read_typetree()
        name = d.get("m_Name", "?")
        props = d.get("m_SavedProperties", {})

        colors = {k: v for k, v in prop_pairs(props.get("m_Colors", []))}
        # ColorVariation이 지정한 값이 머티리얼 기본값을 이긴다
        for ch, col in overrides.get(obj.path_id, {}).items():
            if 0 <= ch < len(VARIATION_CHANNEL_PROPS):
                colors[VARIATION_CHANNEL_PROPS[ch]] = col
        slots, uvs = {}, {}
        for k, v in prop_pairs(props.get("m_TexEnvs", [])):
            pid = v.get("m_Texture", {}).get("m_PathID", 0) if isinstance(v, dict) else 0
            if pid in textures:
                slots[k] = textures[pid]
                uvs[k] = (v["m_Scale"]["x"], v["m_Scale"]["y"],
                          v["m_Offset"]["x"], v["m_Offset"]["y"])

        found = next((p for p in main_props if p in slots), None)
        if found is None:
            # 깊이로 깎여야 하는데 우리가 못 깎는 껍데기는 통째로 뺀다
            if name in carved:
                print(f"  {name}: 깎개가 깊이로 깎는 껍데기 — 통째로 뺌")
                continue
            if effect_albedo(name, colors, slots, uvs, spec, outdir, max_size):
                continue
            print(f"  {name}: {'·'.join(main_props)} 없음 — 건너뜀")
            continue

        main_tex = slots[found].read()
        nums = floats_of(props)
        # 재질이 어떻게 그려지는지는 **재질이 적어 둔다.** 짐작하면 안 된다.
        #
        # ⚠️ **안 적어 둔 재질도 있다.** 사람(`pc####`·`tr####`)과 소품
        # (자전거)의 셰이더에는 `_BlendMode`도 `_CullMode`도 없다 — 실측했다.
        # 그런 것은 예전대로 오려 낸다(`MASK`). 없는 값을 0으로 읽어 불투명으로
        # 돌리면, 지금 잘 나오고 있는 머리카락·속눈썹이 사각형으로 막힌다
        blend = nums.get("_BlendMode")
        opaque = blend == 0
        spec[name] = {
            "uv": uvs[found],
            "wrap": wrap_of(main_tex),
            "alpha": "MASK" if blend is None else GLTF_ALPHA.get(int(blend), "OPAQUE"),
            # 유니티 `CullMode`: 0 Off · 1 Front · 2 Back.
            # ⚠️ 지금은 아무것도 여기 안 걸린다 — Off인 26개가 전부 그림 없는
            # `FireMask*`라 애초에 안 구워진다 (DATA.md §2.17.2). 그래도 읽는다:
            # 값이 있는데 안 읽는 것이 이 파일에서 두 번 사고를 냈다
            "double": nums.get("_CullMode", 2) == 0,
        }
        main = main_tex.image.convert("RGBA")
        w, h = main.size
        col = np.asarray(main, dtype=np.float32) / 255.0
        rgb_lin = srgb_to_linear(col[..., :3])

        # 2층. **불투명한 재질의 알파는 불투명도가 아니라 여기를 꺼내는
        # 마스크다** — 눈이 그렇다. 1층의 알파가 0인 자리에 홍채가 들어간다.
        # 안 겹치면 그 자리가 통째로 뚫린다 (`GLTF_ALPHA` 참조)
        #
        # ⚠️ **불투명한 재질에서만 겹친다.** 반투명 재질(`_BlendMode` 1·2)에서는
        # 알파가 진짜 불투명도라, 같은 값이 2층 마스크를 겸할 수 없다. 그런
        # 재질이 스무 개 있는데(질퍽이 몸통이 그렇다) 무엇이 마스크인지 아직
        # 못 읽었다 — 지어내느니 2층을 안 얹는다
        lerp = nums.get("_Layer1OverLerpValue", 1.0)
        if opaque and nums.get("_Layer1Enable", 0.0) and "_L1Col0Tex" in slots and lerp > 0:
            under = layer_under(main_tex, uvs[found], slots["_L1Col0Tex"].read(),
                                uvs["_L1Col0Tex"], (h, w))
            k = (1.0 - col[..., 3:4]) * lerp
            rgb_lin = rgb_lin * (1.0 - k) + under[..., :3] * k

        if "_MaskTex" in slots:
            mask_img = slots["_MaskTex"].read().image.convert("RGB")
            if mask_img.size != (w, h):
                # 마스크는 보통 절반 해상도다. 영역 경계가 번지지 않게 NEAREST로 확대한다.
                mask_img = mask_img.resize((w, h), Image.NEAREST)
            mask = np.asarray(mask_img, dtype=np.float32) / 255.0
        else:
            mask = np.zeros((h, w, 3), dtype=np.float32)

        def layer(prop: str) -> np.ndarray:
            c = colors.get(prop)
            if not c:
                return np.ones(3, dtype=np.float32)
            return np.array([c["r"], c["g"], c["b"]], dtype=np.float32)

        tint = sum(
            mask[..., i : i + 1] * layer(prop) for i, prop in enumerate(MASK_CHANNEL_PROPS)
        )
        # 어느 채널에도 속하지 않은(검정) 영역은 틴트 없이 _col 그대로 둔다
        coverage = np.clip(mask.sum(axis=2, keepdims=True), 0.0, 1.0)
        tint = tint + (1.0 - coverage)

        out_lin = rgb_lin * tint
        # 불투명하다고 적힌 재질은 알파를 통째로 채운다. 남겨 두면 KTX2로
        # 옮길 때나 다른 곳에서 다시 오려 낼 빌미가 된다
        opacity = np.ones_like(col[..., 3:4]) if opaque else col[..., 3:4]
        out = np.concatenate([linear_to_srgb(out_lin), opacity], axis=2)
        img = Image.fromarray((np.clip(out, 0, 1) * 255).round().astype(np.uint8), "RGBA")

        if max_size is not None and max(img.size) > max_size:
            k = max_size / max(img.size)
            # LANCZOS는 도트가 아니라 사진 계열 텍스처라 이쪽이 맞다
            img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))),
                             Image.LANCZOS)
        path = outdir / f"{name}_albedo.png"
        img.save(path)
        print(f"  {name:<12} {w}x{h} → {path.name} ({img.width}x{img.height})")

    return spec


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("bundle", type=Path)
    ap.add_argument("-o", "--out", type=Path, required=True)
    ap.add_argument(
        "-c", "--color-index", type=int, default=None,
        help="ColorVariation 프리셋 번호(0~3). 생략하면 컴포넌트의 ColorIndex 기본값",
    )
    args = ap.parse_args()
    print(f"{args.bundle.name}:")
    spec = bake(args.bundle, args.out, args.color_index)
    print(f"→ 알베도 {len(spec)}장 생성: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

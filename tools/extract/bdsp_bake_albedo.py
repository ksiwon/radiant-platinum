"""BDSP 캐릭터 알베도 베이크 (PLAN §4.3).

BDSP 캐릭터 셰이더는 색을 텍스처가 아니라 머티리얼 파라미터에 둔다:

    albedo = _MainTex(그레이스케일 음영) × 레이어색[_MaskTex 채널]

_MaskTex는 순수 R/G/B/검정 영역으로 칠해진 선택자다:
    R → _PrimaryColor,  G → _SecondaryColor,  B → _SkinColor,  검정 → 틴트 없음

(_SkinColor는 피부 전용이 아니라 세 번째 범용 레이어 색이다 — 가방은 노랑, 모자는 분홍이 들어간다.)

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


# ⚠️ 두 매핑은 별개다. 하나로 묶으면 의상을 맞추는 순간 머리·눈·얼굴이 깨진다.
#
# ① _MaskTex의 RGB 채널 → 셰이더 색 프로퍼티.
#    실제 게임 화면과 대조해 확정: 조끼(R)=검정 _Skin, 치마(G)=분홍 _Primary,
#    목도리·비니몸통(B)=빨강·흰색 _Secondary, 비니 엠블럼(R)=분홍 _Skin.
MASK_CHANNEL_PROPS = ["_SkinColor", "_PrimaryColor", "_SecondaryColor"]

# ② ColorVariation 컴포넌트의 channel 인덱스 → 셰이더 색 프로퍼티.
#    이쪽은 프로퍼티 선언 순서를 그대로 따른다 (face ch0=피부톤, hair ch1=머리색).
VARIATION_CHANNEL_PROPS = ["_PrimaryColor", "_SecondaryColor", "_SkinColor"]


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


def bake(bundle, outdir: Path, color_index: int | None = None,
         max_size: int | None = None,
         main_props: tuple[str, ...] = ("_MainTex",)) -> int:
    """번들의 머티리얼을 평범한 albedo PNG로 굽는다.

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
    if overrides:
        print(f"  ColorVariation: 머티리얼 {len(overrides)}개에 채널 색 오버라이드 적용")

    outdir.mkdir(parents=True, exist_ok=True)
    made = 0

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
        slots = {}
        for k, v in prop_pairs(props.get("m_TexEnvs", [])):
            pid = v.get("m_Texture", {}).get("m_PathID", 0) if isinstance(v, dict) else 0
            if pid in textures:
                slots[k] = textures[pid]

        found = next((p for p in main_props if p in slots), None)
        if found is None:
            print(f"  {name}: {'·'.join(main_props)} 없음 — 건너뜀")
            continue

        main = slots[found].read().image.convert("RGBA")
        w, h = main.size
        col = np.asarray(main, dtype=np.float32) / 255.0
        rgb_lin = srgb_to_linear(col[..., :3])

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
        out = np.concatenate([linear_to_srgb(out_lin), col[..., 3:4]], axis=2)
        img = Image.fromarray((np.clip(out, 0, 1) * 255).round().astype(np.uint8), "RGBA")

        if max_size is not None and max(img.size) > max_size:
            k = max_size / max(img.size)
            # LANCZOS는 도트가 아니라 사진 계열 텍스처라 이쪽이 맞다
            img = img.resize((max(1, round(img.width * k)), max(1, round(img.height * k))),
                             Image.LANCZOS)
        path = outdir / f"{name}_albedo.png"
        img.save(path)
        made += 1
        print(f"  {name:<12} {w}x{h} → {path.name} ({img.width}x{img.height})")

    return made


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
    n = bake(args.bundle, args.out, args.color_index)
    print(f"→ 알베도 {n}장 생성: {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

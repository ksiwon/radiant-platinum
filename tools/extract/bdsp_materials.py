"""BDSP 캐릭터 머티리얼 색상 추출 (PLAN §4.3).

BDSP는 _col 텍스처가 알베도가 아니라 그레이스케일 음영 맵이고, 실제 색은 Unity 머티리얼의
SkinColor / PrimaryColor / SecondaryColor 값에 있다. _msk가 각 색을 칠할 영역을 고르고
_col은 그 위에 음영만 곱한다. dae/fbx 익스포트는 이 색을 싣지 않으므로 여기서 직접 뽑는다.

사용법:
    python tools/extract/bdsp_materials.py <에셋번들...> [-o out.json]
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import UnityPy


def srgb_hex(c: dict) -> str:
    """Unity는 색을 선형 float으로 저장한다. 웹에서 쓰려면 sRGB 8bit로 변환해야 한다."""

    def enc(x: float) -> int:
        x = max(0.0, min(1.0, x))
        s = 12.92 * x if x <= 0.0031308 else 1.055 * (x ** (1 / 2.4)) - 0.055
        return max(0, min(255, round(s * 255)))

    return "#%02x%02x%02x" % (enc(c["r"]), enc(c["g"]), enc(c["b"]))


def read_bundle(path: Path) -> list[dict]:
    env = UnityPy.load(str(path))
    materials = []
    for obj in env.objects:
        if obj.type.name != "Material":
            continue
        d = obj.read_typetree()
        props = d.get("m_SavedProperties", {})

        colors = {}
        for entry in props.get("m_Colors", []):
            # UnityPy 버전에 따라 (key, value) 튜플 또는 {first,second} 딕셔너리로 나온다
            key, val = entry if isinstance(entry, (list, tuple)) else (entry["first"], entry["second"])
            if isinstance(key, dict):
                key = key.get("name", str(key))
            colors[key] = {"hex": srgb_hex(val), "linear": [val["r"], val["g"], val["b"], val["a"]]}

        floats = {}
        for entry in props.get("m_Floats", []):
            key, val = entry if isinstance(entry, (list, tuple)) else (entry["first"], entry["second"])
            if isinstance(key, dict):
                key = key.get("name", str(key))
            floats[key] = val

        textures = []
        for entry in props.get("m_TexEnvs", []):
            key, val = entry if isinstance(entry, (list, tuple)) else (entry["first"], entry["second"])
            if isinstance(key, dict):
                key = key.get("name", str(key))
            tex = val.get("m_Texture", {}) if isinstance(val, dict) else {}
            if tex.get("m_PathID"):
                textures.append(key)

        materials.append(
            {
                "material": d.get("m_Name", "?"),
                "shader": d.get("m_Shader", {}).get("m_PathID"),
                "colors": colors,
                "floats": floats,
                "textureSlots": textures,
            }
        )
    return materials


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("bundles", nargs="+", type=Path)
    ap.add_argument("-o", "--out", type=Path)
    args = ap.parse_args()

    result = {}
    for b in args.bundles:
        try:
            mats = read_bundle(b)
        except Exception as e:  # 번들 하나가 깨져도 나머지는 계속 뽑는다
            print(f"! {b.name}: {type(e).__name__}: {e}", file=sys.stderr)
            continue
        result[b.name] = mats
        print(f"{b.name}: 머티리얼 {len(mats)}개")
        for m in mats:
            named = {k: v["hex"] for k, v in m["colors"].items() if not k.startswith("_Color")}
            if named:
                print(f"    {m['material']:<12} {named}")

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"→ {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

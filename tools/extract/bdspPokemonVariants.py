"""Extract exact BDSP shiny palettes and the female looks that differ visually.

The regular Pokemon extractor deliberately emits one reusable animated GLB per
species/form.  BDSP stores the other appearances as ``sex x rare`` bundles:

* male/normal   ``..._00_00`` (already in ``public/models/pokemon``)
* male/shiny    ``..._00_01``
* female/normal ``..._01_00``
* female/shiny  ``..._01_01``

Duplicating every animated GLB for shiny Pokemon would add hundreds of MB.  This
script therefore bakes only the exact shiny albedo maps.  The small set of
female bundles that actually contains a different material set is exported as
full GLB, because material slots can differ as well as their textures.

    py -3.13 tools/extract/bdspPokemonVariants.py
    py -3.13 tools/extract/bdspPokemonVariants.py 25 202
"""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import tempfile
from pathlib import Path

import UnityPy

sys.path.insert(0, str(Path(__file__).resolve().parent))

from bdspGlb import export
from bdspPokemon import (
    BATTLE_CLIPS,
    COMMON,
    INDEX,
    MAIN_PROPS,
    MASTER,
    MAX_TEXTURE,
    battle_scales,
    glb_height,
    scale_key,
    trio,
)
from bdsp_bake_albedo import bake

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "public/models/pokemon/variants"
VARIANT_INDEX = OUT / "index.json"


def pokemon_catalog() -> dict[tuple[int, int, int, int], dict]:
    env = UnityPy.load(str(MASTER))
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            if obj.read().m_Name != "PokemonInfo":
                continue
            rows = obj.read_typetree()["Catalog"]
        except Exception:
            continue
        return {
            (row["MonsNo"], row.get("FormNo", 0), row["Sex"], row["Rare"]): row
            for row in rows
        }
    raise RuntimeError("PokemonInfo.Catalog was not found in masterdatas")


def catalog_row(
    catalog: dict[tuple[int, int, int, int], dict],
    dex: int,
    form: int,
    rare: int,
    preferred_sex: int | None = None,
) -> dict | None:
    if preferred_sex is not None:
        exact = catalog.get((dex, form, preferred_sex, rare))
        if exact is not None:
            return exact
    return next((row for (d, f, _sex, r), row in catalog.items()
                 if d == dex and f == form and r == rare), None)


def base_keys() -> list[tuple[str, int, int]]:
    raw = json.loads(INDEX.read_text(encoding="utf-8"))["pokemon"]
    result = []
    for key in raw:
        dex, _, form = key.partition("-")
        result.append((key, int(dex), int(form or 0)))
    return result


def material_suffix(filename: str) -> str:
    stem = filename.removesuffix("_albedo.png")
    suffix = stem.split("-", 1)[-1]
    return suffix.removesuffix("_rare")


def extract_shiny(key: str, bundle: str, scratch: Path) -> dict[str, str]:
    baked = scratch / key
    bake(trio(bundle), baked, None, MAX_TEXTURE, MAIN_PROPS)
    target = OUT / "shiny" / key
    target.mkdir(parents=True, exist_ok=True)
    textures: dict[str, str] = {}
    for source in sorted(baked.glob("*_albedo.png")):
        suffix = material_suffix(source.name)
        dest = target / f"{suffix}.png"
        shutil.move(source, dest)
        textures[suffix] = dest.relative_to(ROOT / "public").as_posix()
    return textures


def appearance_trio(bundle: str, fallback_texture: str) -> list[Path]:
    paths = trio(bundle)
    own_texture = COMMON / bundle
    fallback = COMMON / fallback_texture
    if not own_texture.is_file() and fallback.is_file() and fallback not in paths:
        paths.append(fallback)
    return paths


def extract_female(key: str, row: dict, shiny: bool, fallback_texture: str) -> dict:
    label = "female-shiny" if shiny else "female"
    out = OUT / label / f"{key}.glb"
    out.parent.mkdir(parents=True, exist_ok=True)
    export(
        appearance_trio(row["AssetBundleName"], fallback_texture),
        out,
        None,
        None,
        None,
        MAX_TEXTURE,
        True,
        MAIN_PROPS,
        BATTLE_CLIPS,
    )
    return {
        "file": out.relative_to(ROOT / "public/models/pokemon").as_posix(),
        "height": glb_height(out),
        "scale": round(row["BattleScale"], 3),
    }


def existing_manifest() -> dict:
    if VARIANT_INDEX.is_file():
        return json.loads(VARIANT_INDEX.read_text(encoding="utf-8"))
    return {"version": 1, "shiny": {}, "female": {}, "femaleShiny": {}}


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("dex", type=int, nargs="*", help="National dex numbers; empty means all")
    args = ap.parse_args()

    catalog = pokemon_catalog()
    wanted = set(args.dex)
    todo = [row for row in base_keys() if not wanted or row[1] in wanted]
    manifest = existing_manifest()
    scales = battle_scales()
    OUT.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="rp-pokemon-variants-") as tmp:
        scratch = Path(tmp)
        for i, (key, dex, form) in enumerate(todo, 1):
            male = catalog_row(catalog, dex, form, 0)
            shiny = catalog_row(catalog, dex, form, 1, male["Sex"] if male else None)
            if shiny:
                textures = extract_shiny(key, shiny["AssetBundleName"], scratch)
                if textures:
                    manifest["shiny"][key] = {"textures": textures}

            female = catalog.get((dex, form, 1, 0))
            # Most female rows reuse the male material/mesh entirely.  A female
            # texture bundle exists only for appearances BDSP actually changes.
            if (
                female and male
                and female["AssetBundleName"] != male["AssetBundleName"]
            ):
                manifest["female"][key] = extract_female(
                    key, female, False, male["AssetBundleName"],
                )
                female_shiny = catalog.get((dex, form, 1, 1))
                if female_shiny:
                    manifest["femaleShiny"][key] = extract_female(
                        key, female_shiny, True, shiny["AssetBundleName"],
                    )

            if i % 20 == 0 or i == len(todo):
                print(f"{i}/{len(todo)} variants")

    # Unown glyphs and a few material-only forms intentionally share the base
    # palette.  Keep an explicit key so every exported GLB has a variant entry.
    for key, dex, form in todo:
        base = manifest["shiny"].get(str(dex))
        if form > 0 and key not in manifest["shiny"] and base:
            manifest["shiny"][key] = base

    # Keep scale fallback deterministic even if a catalog row omits BattleScale.
    for group in ("female", "femaleShiny"):
        for key, entry in manifest[group].items():
            dex, _, form = key.partition("-")
            entry.setdefault("scale", scales.get(scale_key(int(dex), int(form or 0)), 1.0))

    # ⚠️ **키 순서를 못 박는다.** 이 표는 넣은 순서로 쓰이는데, `existing_manifest()`
    # 가 있던 파일을 이어받으므로 **언제 무엇을 구웠는지가 바이트에 남는다.** 한 번에
    # 다 구운 것과 나눠 구운 것이 내용은 같고 바이트만 달라져서, 산출물을 지우고
    # 다시 구웠을 때 목차 해시가 이 파일 하나에서만 어긋났다 (크기는 212,808로 같다).
    # 읽는 쪽은 키로 찾으므로(`scene/battle/monModel`) 순서에 기대는 데가 없다
    VARIANT_INDEX.write_text(
        json.dumps(manifest, ensure_ascii=False, separators=(",", ":"), sort_keys=True),
        encoding="utf-8",
    )
    print(
        f"wrote {len(manifest['shiny'])} shiny palettes, "
        f"{len(manifest['female'])} female models, "
        f"{len(manifest['femaleShiny'])} female shiny models -> {VARIANT_INDEX}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

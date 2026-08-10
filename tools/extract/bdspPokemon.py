"""BDSP 포켓몬 모델 → glb (PLAN §16.6, DATA.md §2.17.2).

    pnpm extract:pokemon                     배틀에 나오는 종을 전부 굽는다
    py -3.13 tools/extract/bdspPokemon.py 387 -o public/models/pokemon   한 마리

4세대 배틀은 포켓몬이 80×80 도트 한 장이었고 우리도 그렇게 세워 왔다. 그런데
무대를 BDSP의 진짜 3D로 갈아 끼우고 나니 **그 한 장만 화면에서 튄다** — 앞쪽에
선 내 포켓몬이 3.8m짜리 픽셀 덩어리로 뜬다. 공식 리메이크가 같은 신오를 3D로
다시 만들어 두었으므로, 무대를 가져온 자리에서 몸도 가져온다.

⚠️ **번들이 셋으로 갈려 있다.** 인물(`tr####`)은 한 벌이 자급자족인데 포켓몬은
아니다:

    pokemons/battle/pm0387_00_00      16KB   프리팹 · 재질 · 뼈대 · 동작 14벌
    pokemons/common/pm0387_00        519KB   **메시**
    pokemons/common/pm0387_00_00      40KB   **텍스처**

셋을 한 UnityPy 환경에 같이 올려야 풀린다. 배틀 번들만 열면 메시가 208바이트짜리
껍데기로 보이고, 그대로 구우면 빈 glb가 나온다.

⚠️ **셰이더가 인물과 다르다.** 인물은 `_MainTex`에 그레이스케일 음영 맵을 싣고
색을 머티리얼에서 가져오는데(PLAN §4.3.2), 포켓몬은 `_Col0Tex`가 **그냥 칠해진
그림**이다 (`pm0387_00_00_Body_col`이 초록·노랑·갈색 그대로다). 그래서 채널 색
합성이 필요 없다 — 이름만 다른 자리로 넘겨 준다.

이름은 `pm{도감:04}_{판:02}_{성별·변형:02}`다. `_00_00`이 기본이고 `_01`은
암컷 차이가 있는 종에만 있다. 우리는 지금 기본 한 벌만 쓴다.
"""
from __future__ import annotations

import argparse
import json
import re
import struct
import sys
from pathlib import Path

import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.raw.sources import require_dir

from bdspGlb import export

ROOT = Path(__file__).resolve().parents[2]
BATTLE = require_dir("bdsp.pokemon")
COMMON = require_dir("bdsp.pokemonCommon")
OUTDIR = ROOT / "public/models/pokemon"
INDEX = OUTDIR / "index.json"
MASTER = require_dir("bdsp.masterdatas")

# 포켓몬 셰이더의 알베도 자리. `_MainTex`도 같이 본다 — 몇몇 이펙트 재질이
# 그쪽을 쓴다
MAIN_PROPS = ("_Col0Tex", "_MainTex")

# 신오 도감에 드는 마지막 번호. 4세대는 493종이다
LAST_DEX = 493

# 배틀에서 쓰는 동작만 싣는다. 종마다 클립 열넷이 오는데 `ba*`가 배틀
# (등판 셋 · 대기 · 물리 · 특수 · 피격 · 울음)이고, 나머지 다섯은 아미티광장에서
# 좋아하기·싫어하기, 포핀 먹기, 필드 걷기다 — 애니 데이터의 36%가 거기다
BATTLE_CLIPS = re.compile(r"_ba\d\d_")

# 텍스처 긴 변의 상한. 포켓몬 하나가 512짜리 넉 장을 들고 나오면 glb가 1MB를
# 넘고, 493종이면 그것만 500MB다. 배틀에서 화면을 채우는 크기가 400픽셀 남짓이라
# 256이면 텍셀이 남는다
MAX_TEXTURE = 256


def trio(name: str) -> list[Path]:
    """번들 셋. 없는 것은 뺀다 — 텍스처가 종족 공용인 판이 있다"""
    stem = re.sub(r"_\d\d$", "", name)  # pm0387_00_00 → pm0387_00
    found = [BATTLE / name, COMMON / stem, COMMON / name]
    missing = [p for p in found if not p.is_file()]
    if BATTLE / name in missing:
        raise FileNotFoundError(f"{name}: 배틀 번들이 없다")
    return [p for p in found if p.is_file()]


def available() -> list[tuple[int, str]]:
    """구울 수 있는 종. `(도감 번호, 번들 이름)`

    ⚠️ **판이 여럿인 종은 `_00`이 없다.** 안농·캐스퐁·테오키스·도롱마담·체리버·
    깝질무·트리토돈·로토무·기라티나·쉐이미·아르세우스 열둘이 그렇다 — 판 번호가
    **11부터** 시작한다 (아르세우스가 `_11`~`_28`로 열여덟 판이다). 그중 제일
    앞선 것을 기본 모습으로 쓴다
    """
    out = []
    for dex in range(1, LAST_DEX + 1):
        name = f"pm{dex:04d}_00_00"
        if (BATTLE / name).is_file():
            out.append((dex, name))
            continue
        forms = sorted(BATTLE.glob(f"pm{dex:04d}_??_00"))
        if forms:
            out.append((dex, forms[0].name))
    return out


def bake_one(dex: int, name: str, outdir: Path) -> dict:
    out = outdir / f"{dex}.glb"
    stat = export(
        trio(name), out, None, None, None, MAX_TEXTURE, True, MAIN_PROPS,
        BATTLE_CLIPS,
    )
    return {
        "정점": stat["vertices"],
        "삼각형": stat["triangles"],
        "뼈": stat["bones"],
        "동작": stat["clips"],
        # 바인드 포즈에서 잰 키(m). 종마다 크기가 다른 것을 이걸로 옮긴다
        "높이": round(stat["height"], 3),
        "바깥": round(stat["outward"], 3),
        "바이트": out.stat().st_size,
    }


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("dex", type=int, nargs="*", help="도감 번호. 비우면 전부")
    ap.add_argument("-o", "--out", type=Path, default=OUTDIR)
    args = ap.parse_args()

    todo = available()
    if args.dex:
        want = set(args.dex)
        todo = [(d, n) for d, n in todo if d in want]
        missing = want - {d for d, _ in todo}
        if missing:
            print(f"⚠️ 번들이 없다: {sorted(missing)}")
    print(f"종 {len(todo)}마리")

    total = 0
    for i, (dex, name) in enumerate(todo, 1):
        try:
            stat = bake_one(dex, name, args.out)
        except SystemExit as e:
            print(f"  {dex:>3} {name}: {e}")
            continue
        total += stat["바이트"]
        # ⚠️ 인물(0.6)보다 낮게 잡는다. 포켓몬은 날개·지느러미처럼 **속이 없는**
        # 얇은 판이 섞여 있어서 그쪽 삼각형이 절반씩 안팎으로 갈린다 —
        # 독침붕이 0.595다. 0.4 아래면 감기 순서가 통째로 뒤집힌 것이다
        if stat["바깥"] < 0.4:
            print(f"  ⚠️ {dex}: 면이 안쪽을 본다 ({stat['바깥']})")
        if i % 25 == 0 or i == len(todo):
            print(f"  {i}/{len(todo)}  {total / 1e6:.1f}MB")

    index = write_index(args.out)
    print(f"모두 {len(index)}마리 · {total / 1e6:.1f}MB → {args.out}")
    return 0


def glb_height(path: Path) -> float:
    """구운 glb의 키(m). 바인드 포즈의 정점 최댓값에서 잰다.

    번들을 다시 열지 않고 결과물에서 재는 이유는 **목록이 디스크와 어긋나지 않게**
    하기 위해서다. 한 마리만 다시 구워도 목록 전체가 맞아야 한다
    """
    raw = path.read_bytes()
    jlen = struct.unpack_from("<I", raw, 12)[0]
    gltf = json.loads(raw[20:20 + jlen])
    top = -1e9
    low = 1e9
    for mesh in gltf["meshes"]:
        for prim in mesh["primitives"]:
            acc = gltf["accessors"][prim["attributes"]["POSITION"]]
            top = max(top, acc["max"][1])
            low = min(low, acc["min"][1])
    return round(top - low, 3)


def battle_scales() -> dict[int, float]:
    """종마다 배틀에서 곱하는 배율 (`PokemonInfo.Catalog.BattleScale`).

    ⚠️ **모델을 실측 크기로 세우면 안 된다.** 개굴닌자가 0.097m, 레쿠쟈가
    10.9m라 한 화면에 같이 세울 수가 없다. BDSP는 종마다 배율을 따로 적어
    두었고(모부기 1.98 · 잠만보 0.89 · 강철톤 0.43) 그걸로 화면에 드는 크기를
    좁힌다 — 우리가 지어낼 값이 아니다.

    masterdatas가 없으면 빈 표를 준다. 그러면 실측 크기 그대로 선다
    """
    if not MASTER.is_file():
        print(f"⚠️ {MASTER}가 없다 — 배율 없이 실측 크기로 굽는다")
        return {}
    import UnityPy
    env = UnityPy.load(str(MASTER))
    for obj in env.objects:
        if obj.type.name != "MonoBehaviour":
            continue
        try:
            if obj.read().m_Name != "PokemonInfo":
                continue
            tree = obj.read_typetree()
        except Exception:
            continue
        # 기본 모습(판 0 · 수컷 · 보통색)이 우선이고, 없으면 그 종의 아무 줄이나
        # 쓴다 — 레쿠쟈처럼 기본 줄이 없는 종이 있다
        out: dict[int, float] = {}
        spare: dict[int, float] = {}
        for row in tree["Catalog"]:
            scale = round(row["BattleScale"], 3)
            spare.setdefault(row["MonsNo"], scale)
            if row["FormNo"] == 0 and row["Sex"] == 0 and row["Rare"] == 0:
                out[row["MonsNo"]] = scale
        for no, scale in spare.items():
            out.setdefault(no, scale)
        return out
    return {}


def write_index(outdir: Path) -> dict:
    """`index.json`을 **디스크에 있는 것**으로 다시 쓴다"""
    scales = battle_scales()
    index = {}
    for glb in sorted(outdir.glob("*.glb"), key=lambda p: int(p.stem)):
        dex = int(glb.stem)
        index[glb.stem] = {
            "file": glb.name,
            "height": glb_height(glb),
            "scale": scales.get(dex, 1.0),
        }
    INDEX.parent.mkdir(parents=True, exist_ok=True)
    INDEX.write_text(json.dumps({"pokemon": index}, ensure_ascii=False), encoding="utf-8")
    return index


if __name__ == "__main__":
    raise SystemExit(main())

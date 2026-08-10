"""BDSP 동작 타이밍 표 → `motionTiming.json` (PLAN §16.6, DATA.md §2.17.2).

    pnpm extract:motionTiming

**때리는 순간은 종마다 다르다.** 여태 우리는 한 박자로 때렸는데(`LUNGE` 상수
하나) 공식 리메이크는 종마다 타격 프레임을 적어 두었다 —
`battle_masterdatas`의 `BattleDataTable.MotionTimingData` 1,008줄이다.
모부기는 물리 25프레임, 리아코는 14프레임이다.

한 줄이 (종·폼·성별)이고 칸이 스물이다:

    Buturi01~03   물리 (`ba20` 클립)   Tokusyu01~03  특수 (`ba21`)
    BodyBlow · Punch · Kick · Tail · Bite · Peck · Radial   부위별 타격
    Cry (`ba02`) · Dust · Shot · Guard · LandingFall (`ba01`) · LandingFallEase

⚠️ **성별 칸은 버린다.** 559개 종·폼 조합을 전부 대조하면 **남녀가 다른 조합이
0개**다. 남겨 두면 파일이 두 배가 되고 읽는 쪽이 성별을 알아야 한다.

⚠️ **단위는 30프레임/초다.** 표는 프레임 번호만 주고 초를 안 준다. 클립 길이와
견주는 것으로는 못 가른다 — 30fps로 읽든 60fps로 읽든 465종이 465종 다 클립
안에 든다. 가른 것은 **돌진의 정점**이다: `ba20` 클립에서 뿌리 뼈가 제자리에서
제일 멀리 나간 시각을 재어 표와 견주면, 454종 중 **410종이 30fps 쪽에 더
가깝다**(중앙 오차 0.23초 대 0.52초).

우리가 실제로 쓰는 것은 클립이 있는 넷뿐이다(`monModel.MOTION`) — 물리 · 특수 ·
울음 · 등판. 나머지 칸은 그 동작을 아직 안 트므로 안 싣는다.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import UnityPy
except ImportError:  # pragma: no cover
    sys.exit('UnityPy가 없다. `py -3.13 -m pip install UnityPy`')

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
from tools.raw.sources import require_dir  # noqa: E402

# 자리는 어댑터가 정한다 (`tools/raw/sources`) — raw를 정리해도 여기가 안 바뀐다
BUNDLE = require_dir('bdsp.root') / 'Battle' / 'battle_masterdatas'
OUT = ROOT / 'public' / 'data' / 'motionTiming.json'

# 표의 칸 이름 → 우리 동작 이름 (`scene/battle/monModel.MOTION`)
WANT = {
    'physical': 'Buturi01',
    'special': 'Tokusyu01',
    'cry': 'Cry',
    'enter': 'LandingFall',
}


def read_table(path: Path) -> list[dict]:
    env = UnityPy.load(str(path))
    for obj in env.objects:
        if obj.type.name != 'MonoBehaviour':
            continue
        tree = obj.read_typetree()
        if tree.get('m_Name') == 'BattleDataTable':
            return tree['MotionTimingData']
    raise SystemExit(f'{path}에 BattleDataTable이 없다')


def main() -> None:
    # 콘솔 기본이 cp949라 한글 로그가 그냥 터진다 (`bdspArena`와 같은 처리)
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--bundle', type=Path, default=BUNDLE)
    ap.add_argument('-o', '--out', type=Path, default=OUT)
    args = ap.parse_args()

    rows = read_table(args.bundle)

    # 성별이 정말 안 갈리는지 **여기서 다시 센다.** 표가 바뀌면 알아야 한다
    by_key: dict[tuple[int, int], list[dict]] = {}
    for row in rows:
        by_key.setdefault((row['MonsNo'], row['FormNo']), []).append(row)
    fields = [k for k in rows[0] if k not in ('MonsNo', 'FormNo', 'Sex')]
    split = sum(
        1 for group in by_key.values()
        if len(group) > 1 and any(group[0][f] != group[1][f] for f in fields)
    )
    if split:
        raise SystemExit(f'성별로 값이 갈리는 조합이 {split}개다 — 성별을 버리면 안 된다')

    # `종*100 + 폼`을 열쇠로 쓴다. 폼이 있는 종 66개가 그대로 들어간다
    out: dict[str, list[int]] = {}
    for (mons, form), group in sorted(by_key.items()):
        out[str(mons * 100 + form)] = [group[0][WANT[name]] for name in WANT]

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps({'fps': 30, 'order': list(WANT), 'frames': out}, separators=(',', ':')),
        encoding='utf-8',
    )
    print(f'{args.out.relative_to(ROOT)} — 종·폼 {len(out)}개 '
          f'({args.out.stat().st_size / 1024:.1f}KB)')


if __name__ == '__main__':
    main()

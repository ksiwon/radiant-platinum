"""BDSP 오버월드 인물 번들을 훑어 **어느 번들이 누구인가**를 적는다 (DATA.md §2.16).

플래티넘 NPC는 판때기 그림 470칸이고 이름이 `BUG_CATCHER`처럼 뜻으로 붙어 있다.
BDSP는 같은 신오를 3D로 다시 만든 것이라 같은 사람들이 들어 있는데, 번들 이름은
`fc1006_00`처럼 번호다. 둘을 이으려면 번들 안에서 **뜻이 붙은 이름**을 찾아야 한다.

찾을 자리는 텍스처 이름이다. `fc1006_00_bugcatcher_body_col` 같은 꼴이라 가운데
토막이 곧 그 사람의 갈래다.

    py -3.13 tools/extract/bdspNpc.py <persons/field 경로> <출력 json>

⚠️ 이 스크립트는 **이름표만 뽑는다.** 메시·뼈대를 glb로 굽는 것은 다음 걸음이다.
먼저 누가 누군지 확정하지 않으면, 구운 다음에 엉뚱한 사람을 세우게 된다.

앞서 romfs를 여는 절차 (PLAN §4.3.1):

    nstool -t pfs -x <out> <nsp>                     NCA 셋이 나온다
    nstool -t nca --fstree <program.nca>             경로를 본다
    nstool -t nca -x /1/Data/StreamingAssets/AssetAssistant/Characters <out> <program.nca>

⚠️ Git Bash에서는 `MSYS_NO_PATHCONV=1`을 앞에 붙인다. 안 그러면 `/1/...`이
윈도 경로로 바뀌어 "Failed to extract virtual path"가 난다.
"""
import collections
import json
import os
import re
import sys

import UnityPy

# `tr0001_00_champion_body_col` — 번호 · 판번호 · **갈래** · 부위 · 쓰임
#
# 앞 두 글자가 어느 뭉치인지를 말한다: `tr`은 배틀용 등신, `fc`는 오버월드
# 치비, `pc`는 주인공 둘. 우리는 등신을 쓴다 (PLAN §4.3)
NAME = re.compile(r'^((?:tr|fc|pc)\d+)_(\d+)_([A-Za-z][A-Za-z0-9]*)_')

# 갈래가 아니라 부위·재질을 가리키는 낱말. 이름표로 세면 안 된다
NOT_A_ROLE = {'body', 'face', 'hair', 'wear', 'bag'}


def tags_of(path):
    """번들 하나에 들어 있는 갈래 이름들. 없으면 빈 목록"""
    try:
        env = UnityPy.load(path)
    except Exception:
        return None
    found = set()
    for obj in env.objects:
        if obj.type.name != 'Texture2D':
            continue
        try:
            name = obj.read().m_Name
        except Exception:
            continue
        m = NAME.match(name)
        if m and m.group(3) not in NOT_A_ROLE:
            found.add(m.group(3))
    return sorted(found)


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else 'raw/bdsp/Characters/persons/field'
    out = sys.argv[2] if len(sys.argv) > 2 else 'raw/bdsp/fcTags.json'

    table = {}
    for name in sorted(os.listdir(root)):
        path = os.path.join(root, name)
        if not os.path.isfile(path):
            continue
        tags = tags_of(path)
        if tags is None:
            print(f'  {name}: 못 열었다')
            continue
        table[name] = tags

    named = {b: t for b, t in table.items() if t}
    vocab = sorted({t for ts in named.values() for t in ts})
    counts = collections.Counter(t for ts in named.values() for t in ts)

    json.dump(
        {'bundles': table, 'vocabulary': vocab},
        open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1,
    )
    print(f'번들 {len(table)} · 이름표가 붙은 것 {len(named)} · 낱말 {len(vocab)}')
    blank = [b for b, t in table.items() if not t]
    if blank:
        print(f'이름표가 없는 번들 {len(blank)}: {blank}')
    # 한 낱말이 번들 여럿에 걸리면 옷 갈아입은 같은 사람이다 (fc0001_00 ~ _22)
    many = [(t, n) for t, n in counts.most_common() if n > 1]
    print(f'번들 여럿에 걸친 낱말 {len(many)}: {many[:10]}')


if __name__ == '__main__':
    main()

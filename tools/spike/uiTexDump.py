"""BDSP UI 아틀라스를 PNG로 떨군다 — **창의 실측 근거** (DESIGN.md §1).

    py -3.13 tools/spike/uiTexDump.py "UIs/shareduiassets/sharedui"
    py -3.13 tools/spike/uiTexDump.py --list "UIs/textures/common"

`.audit/uitex/`에 쓴다.

⚠️ **떨군 것을 커밋하지 않는다** (COPYRIGHT.md §5). 원본 자산의 픽셀 그대로다.
`.audit/`은 Git 무시고, 여기서 재는 것은 색 몇 개뿐이다 — 그 값만 `theme/day.css.ts`에
남는다.

⚠️ 창틀·막대는 **스프라이트 아틀라스** 한 장에 다 들어 있다. 낱장으로 안 나오므로
아틀라스를 통째로 뽑고 좌표로 잘라 본다.
"""
from __future__ import annotations

import sys
from pathlib import Path

import UnityPy

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from tools.raw.sources import ROOT, require_dir  # noqa: E402


def main() -> int:
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    listing = '--list' in sys.argv
    if not args:
        print(__doc__)
        return 2

    root = require_dir('bdsp.root')
    out = ROOT / '.audit/uitex'
    out.mkdir(parents=True, exist_ok=True)

    for rel in args:
        path = root / rel
        if not path.is_file():
            print(f'!! 없다 {path}')
            continue
        env = UnityPy.load(str(path))
        seen: set[tuple[str, int]] = set()
        for obj in env.objects:
            if obj.type.name != 'Texture2D':
                continue
            data = obj.read()
            key = (data.m_Name, data.m_Width)
            if key in seen:
                continue
            seen.add(key)
            if listing:
                print(f'   {data.m_Name:46s} {data.m_Width}x{data.m_Height}')
                continue
            name = rel.replace('/', '_') + '__' + data.m_Name.replace(' ', '_') + '.png'
            data.image.save(out / name)
            print(f'   {name}  {data.image.size}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

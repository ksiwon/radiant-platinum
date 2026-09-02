"""일본어 UI 글꼴을 **화면에 실제로 나오는 글자만** 남겨서 굽는다 (DESIGN.md §4).

    py -3.13 tools/fonts/jpSubset.py

`public/fonts/NotoSansJP-{Regular,Bold}.subset.woff2` + 허가문을 쓴다.

왜 서브셋인가: 원본은 한 벌에 5.3MB다 (한자 16,732자). 그런데 **4세대 일본어판은
한자를 안 쓴다** — 게임 텍스트 496개 파일에서 뽑은 글자 306종에 한자가 0자였고
가나·전각기호뿐이다. 한자를 빼면 34KB가 된다.

왜 가나 블록 전체인가: 대사는 고정이지만 **플레이어가 이름을 직접 친다**.
나온 글자만 남기면 자기 이름의 「ヴ」가 두부로 뜬다.

⚠️ **한자를 일부러 안 넣는다.** 넣으면 `unicode-range`에 한자가 들어가고, 그러면
한국어 화면의 한자까지 일본 자형으로 끌려간다 (DESIGN.md §4의 순서 문제).
일본어 게임 텍스트에 한자가 없으니 넣을 이유도 없다.

⚠️ Noto Sans JP는 OFL이고 예약 이름이 **'Source'**다 ('Noto Sans JP'가 아니다).
서브셋을 만들어도 이름을 그대로 쓸 수 있고, 허가문만 같이 나가면 된다
(`tools/distribution/check.mjs` ①-c).
"""
from __future__ import annotations

import re
import urllib.parse
import urllib.request
from pathlib import Path

from fontTools import subset

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'public/fonts'
LICENSE_URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/OFL.txt'
UA = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120 Safari/537.36'}

# 남길 것. 한자(U+4E00–9FFF)는 **일부러 없다**
RANGES = [
    (0x3000, 0x303F),  # 전각 구두점 — 、。「」
    (0x3040, 0x309F),  # 히라가나
    (0x30A0, 0x30FF),  # 가타카나
    (0xFF01, 0xFF5E),  # 전각 영숫자
    (0xFF61, 0xFF9F),  # 반각 가타카나
]
# 낱개로 더 넣는 것. Pretendard 서브셋에 없어서 시스템 글꼴로 새던 것들이다
#
# ⚠️ **U+2026(…)은 여기 없다.** Pretendard가 그것을 갖고 있어서, 이 글꼴이
# 그 자리를 맡으면 낫표와 같은 일이 난다 — 한국어 화면이 말줄임표 하나 때문에
# 이 글꼴을 받아 가고 자형도 일본 쪽으로 끌린다 (`fonts.css.ts`의 `JP_RANGE`).
# 두 글꼴의 cmap을 fontTools로 세어 확인했다
EXTRA = [
    0x22EF,  # ⋯ — 원작 말줄임
    0x2640, 0x2642,  # ♀ ♂ — 성별
    0x266B,  # ♫ — 「구구!」 같은 울음
    0x329A, 0x329B,  # ㊚ ㊛
]

WEIGHTS = {400: 'Regular', 700: 'Bold'}


def source(text: str) -> dict[int, bytes]:
    """구글 폰트에서 굵기별 woff2를 받는다. `text=`를 줘야 청크로 안 쪼개서 준다."""
    url = ('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;700&text='
           + urllib.parse.quote(text))
    css = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read().decode()
    got = {}
    for weight, href in re.findall(r'font-weight: (\d+);\s*src: url\((https://[^)]+)\)', css):
        got[int(weight)] = urllib.request.urlopen(
            urllib.request.Request(href, headers=UA), timeout=120).read()
    missing = set(WEIGHTS) - set(got)
    if missing:
        raise SystemExit(f'굵기 {sorted(missing)}를 못 받았다')
    return got


def main() -> int:
    codepoints = [c for a, b in RANGES for c in range(a, b + 1)] + EXTRA
    OUT.mkdir(parents=True, exist_ok=True)
    raw = source(''.join(chr(c) for c in codepoints))

    for weight, name in WEIGHTS.items():
        src = OUT / f'.NotoSansJP-{name}.src.woff2'
        src.write_bytes(raw[weight])
        out = OUT / f'NotoSansJP-{name}.subset.woff2'
        subset.main([
            str(src),
            '--unicodes=' + ','.join(f'U+{c:04X}' for c in codepoints),
            '--flavor=woff2',
            # 가로쓰기 가나에는 합자도 자리 조정도 필요 없다. 넣으면 배가 된다
            '--layout-features=',
            '--no-hinting',
            '--desubroutinize',
            '--drop-tables+=vhea,vmtx,VORG',
            f'--output-file={out}',
        ])
        src.unlink()
        print(f'  {out.relative_to(ROOT)}  {out.stat().st_size // 1024}KB')

    lic = OUT / 'NotoSansJP-OFL.txt'
    lic.write_bytes(urllib.request.urlopen(
        urllib.request.Request(LICENSE_URL, headers=UA), timeout=60).read())
    print(f'  {lic.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

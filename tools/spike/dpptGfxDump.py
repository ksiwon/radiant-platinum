"""DPPt 디컴프 그래픽을 눈으로 볼 수 있는 PNG로 떨군다 — **원작 배치의 실측 근거**.

    py -3.13 tools/spike/dpptGfxDump.py bag        # 가방 화면 배경·가방 그림
    py -3.13 tools/spike/dpptGfxDump.py party      # 파티 화면 배경

디컴프의 그래픽은 화면 한 장이 아니라 **타일셋 + 타일맵 + 팔레트** 셋으로 흩어져
있다. 셋을 합쳐야 원작이 실제로 무엇을 그렸는지 보인다 — 「왼쪽에 가방이 서 있다」
같은 말을 기억이 아니라 그림으로 확인하려고 만들었다.

`.audit/dppt/`에 쓴다.

⚠️ **떨군 것을 커밋하지 않는다** (COPYRIGHT.md §5). 원본 픽셀 그대로다.
`.audit/`은 Git 무시고, 여기서 가져오는 것은 색 몇 개와 자리 몇 개뿐이다.
"""
from __future__ import annotations

import struct
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
GFX = ROOT / 'raw/decomp/res/graphics'
OUT = ROOT / '.audit/dppt'


def jasc(path: Path) -> list[tuple[int, int, int]]:
    """JASC-PAL 텍스트 → RGB 목록. 디컴프의 `.pal`이 전부 이 꼴이다."""
    lines = path.read_text(encoding='ascii').splitlines()
    if lines[0].strip() != 'JASC-PAL':
        raise SystemExit(f'JASC-PAL이 아니다: {path}')
    n = int(lines[2])
    out = []
    for line in lines[3:3 + n]:
        r, g, b = (int(v) for v in line.split())
        out.append((r, g, b))
    return out


def tiles(path: Path) -> list[list[int]]:
    """타일셋 PNG → 8×8 타일마다 색 번호 64개.

    디컴프는 4bpp 타일셋을 **회색조 PNG**로 들고 있다. 값이 색 번호×17이라
    17로 나눠야 팔레트 자리가 된다 (0·17·34…255).
    """
    im = Image.open(path)
    px = im.convert('L').load()
    w, h = im.size
    out = []
    for ty in range(h // 8):
        for tx in range(w // 8):
            out.append([px[tx * 8 + x, ty * 8 + y] // 17 for y in range(8) for x in range(8)])
    return out


def nscr(path: Path) -> tuple[int, int, list[int]]:
    """NSCR → (폭, 높이, 타일 항목). 항목은 u16: 번호 0‑9 · 좌우 10 · 상하 11 · 팔레트 12‑15."""
    d = path.read_bytes()
    if d[:4] != b'RCSN' or d[16:20] != b'NRCS':
        raise SystemExit(f'NSCR이 아니다: {path}')
    w, h = struct.unpack_from('<HH', d, 24)
    size = struct.unpack_from('<I', d, 32)[0]
    body = d[36:36 + size]
    return w, h, list(struct.unpack(f'<{len(body) // 2}H', body))


def screen(tileset: Path, tilemap: Path, pal: Path, out: Path) -> None:
    ts, colors = tiles(tileset), jasc(pal)
    w, h, cells = nscr(tilemap)
    im = Image.new('RGB', (w, h))
    put = im.load()
    across = w // 8
    for i, cell in enumerate(cells):
        idx, hflip, vflip, prow = cell & 0x3ff, cell >> 10 & 1, cell >> 11 & 1, cell >> 12
        if idx >= len(ts):
            continue
        ox, oy = (i % across) * 8, (i // across) * 8
        for y in range(8):
            for x in range(8):
                sx, sy = (7 - x if hflip else x), (7 - y if vflip else y)
                put[ox + x, oy + y] = colors[prow * 16 + ts[idx][sy * 8 + sx]]
    im.save(out)
    print(f'  {out.relative_to(ROOT)}  {w}×{h}')


def sheet(src: Path, out: Path, frame: int) -> None:
    """스프라이트 시트를 프레임 높이로 잘라 가로로 늘어놓는다. 팔레트는 PNG 안에 있다."""
    im = Image.open(src).convert('RGBA')
    w, h = im.size
    n = h // frame
    strip = Image.new('RGBA', (w * n, frame))
    for i in range(n):
        strip.paste(im.crop((0, i * frame, w, (i + 1) * frame)), (i * w, 0))
    strip.save(out)
    print(f'  {out.relative_to(ROOT)}  {n}장 × {w}×{frame}')


def bag() -> None:
    d = GFX / 'bag'
    screen(d / 'bag_ui_main_tileset.png', d / 'bag_ui_main.NSCR', d / 'bag_ui_main.pal', OUT / 'bag_main.png')
    screen(d / 'bag_ui_main_tileset.png', d / 'item_list_border.NSCR', d / 'bag_ui_main.pal', OUT / 'bag_list_border.png')
    screen(d / 'pokeball_borders_tileset.png', d / 'pokeball_borders.NSCR', d / 'pokeball_borders.pal',
           OUT / 'bag_pokeball_borders.png')
    for who in ('male', 'female'):
        sheet(d / f'bag_sprite_{who}.png', OUT / f'bag_sprite_{who}.png', 64)
    sheet(d / 'pocket_selector_icons.png', OUT / 'bag_pocket_icons.png', 16)


def party() -> None:
    d = GFX / 'party_menu'
    for png in sorted(d.glob('*.png')):
        Image.open(png).convert('RGBA').save(OUT / f'party_{png.stem}.png')
        print(f'  party_{png.stem}.png')


JOBS = {'bag': bag, 'party': party}


def main() -> int:
    if len(sys.argv) < 2 or sys.argv[1] not in JOBS:
        print(__doc__)
        print('할 수 있는 것:', ', '.join(JOBS))
        return 2
    OUT.mkdir(parents=True, exist_ok=True)
    JOBS[sys.argv[1]]()
    return 0


if __name__ == '__main__':
    raise SystemExit(main())

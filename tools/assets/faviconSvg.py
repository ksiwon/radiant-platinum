# 파비콘 SVG — `radiant-platinum-icon.png`에서 굽는다.
#
#     py -3.13 tools/assets/faviconSvg.py      (pnpm assets:favicon)
#
# ⚠️ **선으로 따라 그리지 않는다.** 아이콘은 금빛 그라디언트와 붉은 발광이
# 겹친 그림이라, 벡터로 추적하면 색 띠가 생기고 발광이 사라진다 — 그건 "SVG로
# 바꿨다"가 아니라 다른 그림이 된 것이다. 그래서 원본 픽셀을 그대로 안에 담고
# SVG는 **어느 크기에서도 안 깨지는 껍데기** 역할만 한다.
#
# ⚠️ **색을 줄이지 않는다.** 256색으로 눌러 담으면 파일이 절반이 되는데
# 금빛 기울기에서 픽셀당 최대 60/255까지 어긋난다 (p99 = 19). 무손실로 둔다.
#
# 크기는 원본 1254px에서 256px로 줄인 것이다. 탭·북마크·작업표시줄이 실제로
# 쓰는 자리는 16~48px이고, 설치 아이콘처럼 큰 자리는 manifest가 1254px PNG를
# 따로 준다 (`public/manifest.webmanifest`).
import base64
import io
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parents[2]
SRC = HERE / 'public' / 'assets' / 'radiant-platinum-icon.png'
OUT = HERE / 'public' / 'assets' / 'radiant-platinum-favicon.svg'
SIZE = 256


def main() -> None:
    im = Image.open(SRC).convert('RGBA').resize((SIZE, SIZE), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'PNG', optimize=True)
    data = base64.b64encode(buf.getvalue()).decode('ascii')
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}"'
        f' width="{SIZE}" height="{SIZE}">'
        '<title>Radiant Platinum</title>'
        f'<image width="{SIZE}" height="{SIZE}" href="data:image/png;base64,{data}"/>'
        '</svg>\n'
    )
    OUT.write_text(svg, encoding='utf-8', newline='\n')
    print(f'{OUT.relative_to(HERE).as_posix()} {len(svg) / 1024:.1f}KB'
          f' ({SIZE}px 무손실, 원본 {im.width}px에서)')


if __name__ == '__main__':
    main()

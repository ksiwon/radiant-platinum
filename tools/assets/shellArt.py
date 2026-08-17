# 앱 셸의 그림을 마스터에서 굽는다 (COPYRIGHT.md §11 · DEPLOY.md §3).
#
#     py -3.13 tools/assets/shellArt.py        (pnpm assets:art)
#
# ⚠️ **마스터는 `art/`에 있고 배포물에 안 들어간다.** 예전에는 그린 그대로의
# PNG가 `public/assets`에 있었고 그것이 그대로 나갔다 — 첫 방문 3,850kB 중
# **3,642kB가 그림 셋**이었다 (`.audit/wire.mjs`로 서버 쪽에서 잰 값). 앱 코드
# 전부가 180kB인데 그림이 그 스무 배였다.
#
# 줄이는 방법이 그림마다 다르다. 아래 값은 전부 **재고 고른 것**이다.
#
# ## 타이틀 배경 — 다시 인코딩한다
#
# 1672×941은 화면에 그대로 필요한 크기라 줄일 수 없다. 포맷을 바꾼다:
#
# | | 크기 | 오차 (채널당 0~255) |
# |---|---|---|
# | PNG (그린 것) | 2,348kB | — |
# | PNG 다시 굽기 | 2,249kB | 0 |
# | WebP 무손실 | 1,638kB | 0 |
# | **WebP q=95** | **403kB** | 평균 0.97 · p99 5 · 최대 44 |
# | WebP q=90 | 264kB | 평균 — · p99 7 |
#
# q를 95보다 올려도 오차가 안 줄고(p99가 96·98·100에서 다 5다) 크기만 40%
# 커진다. 그래서 95다. 최대 44는 로고 가장자리 몇 픽셀이고 평균은 1도 안 된다.
#
# ## 아이콘 — 안 쓰는 픽셀을 버린다
#
# 1254×1254를 그 크기로 쓰는 자리가 없다. PWA 설치 아이콘이 실제로 읽는 제일
# 큰 자리가 512다. **여기는 손실 압축을 안 쓴다** — 알파가 있는 그림이라 WebP
# 손실로 구우면 투명한 자리에서 최대 238/255까지 어긋난다(실측). 크기만 줄인다.
#
# ## 파비콘 — 탭에 뜨는 크기만큼만
#
# 탭·북마크·작업표시줄이 쓰는 자리는 16~48px이다. 256px을 담고 있었고 그것이
# base64로 부풀어 102kB였다. 128px이면 2배 화면에서도 안 깨진다.
#
# ⚠️ **파비콘은 여전히 벡터가 아니다.** 금빛 기울기와 붉은 발광을 선으로 따라
# 그리면 색 띠가 생기고 발광이 사라진다 — 그건 줄인 것이 아니라 다른 그림이다.
# SVG는 어느 크기에서도 안 깨지는 껍데기고 안에 원본 픽셀이 든다.
import base64
import io
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
ART = ROOT / 'art'
OUT = ROOT / 'public' / 'assets'

INTRO_QUALITY = 95
ICON_SIZE = 512
FAVICON_SIZE = 128
FAVICON_PNG_SIZE = 64


def kb(n: int) -> str:
    return f'{n / 1024:,.1f}kB'


def bake_intro() -> None:
    src = ART / 'radiant-platinum-intro.png'
    im = Image.open(src)
    out = OUT / 'radiant-platinum-intro.webp'
    im.save(out, 'WEBP', quality=INTRO_QUALITY, method=6)
    print(f'{out.relative_to(ROOT).as_posix()} {kb(out.stat().st_size)}'
          f' ({im.width}×{im.height} q={INTRO_QUALITY}, 마스터 {kb(src.stat().st_size)})')


def bake_icon() -> Image.Image:
    src = ART / 'radiant-platinum-icon.png'
    im = Image.open(src).convert('RGBA')
    small = im.resize((ICON_SIZE, ICON_SIZE), Image.LANCZOS)
    out = OUT / 'radiant-platinum-icon.png'
    small.save(out, 'PNG', optimize=True)
    print(f'{out.relative_to(ROOT).as_posix()} {kb(out.stat().st_size)}'
          f' ({ICON_SIZE}px 무손실, 마스터 {im.width}px {kb(src.stat().st_size)})')
    return im


def bake_favicons(master: Image.Image) -> None:
    small = master.resize((FAVICON_SIZE, FAVICON_SIZE), Image.LANCZOS)
    buf = io.BytesIO()
    small.save(buf, 'PNG', optimize=True)
    data = base64.b64encode(buf.getvalue()).decode('ascii')
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {FAVICON_SIZE} {FAVICON_SIZE}"'
        f' width="{FAVICON_SIZE}" height="{FAVICON_SIZE}">'
        '<title>Radiant Platinum</title>'
        f'<image width="{FAVICON_SIZE}" height="{FAVICON_SIZE}"'
        f' href="data:image/png;base64,{data}"/>'
        '</svg>\n'
    )
    out = OUT / 'radiant-platinum-favicon.svg'
    out.write_text(svg, encoding='utf-8', newline='\n')
    print(f'{out.relative_to(ROOT).as_posix()} {kb(len(svg))} ({FAVICON_SIZE}px 무손실)')

    tiny = master.resize((FAVICON_PNG_SIZE, FAVICON_PNG_SIZE), Image.LANCZOS)
    out = OUT / 'radiant-platinum-favicon.png'
    tiny.save(out, 'PNG', optimize=True)
    print(f'{out.relative_to(ROOT).as_posix()} {kb(out.stat().st_size)} ({FAVICON_PNG_SIZE}px)')


def main() -> None:
    bake_intro()
    bake_favicons(bake_icon())


if __name__ == '__main__':
    main()
